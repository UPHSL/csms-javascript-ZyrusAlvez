import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import request from "supertest";

import { createApp } from "../src/app.js";
import { openDatabase } from "../src/database/connection.js";
import { ServiceRequest } from "../src/models/ServiceRequest.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { createTemporaryDatabasePath, removeDatabase, makeResident, saveResident } from "../src/utils/testUtils.js";

// T15 System Hardening and Regression Testing.
// Every test builds the real application (HTTP -> controllers -> services -> SQLite)
// on its own temporary database and removes it afterwards, so no test depends on
// another test, on execution order, or on the permanent data/csms.db.

function createHardeningSetup() {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const serviceRequestRepository = new ServiceRequestRepository(databasePath);
  const app = createApp({ residentRepository, serviceRequestRepository });

  const maria = saveResident(
    residentRepository,
    makeResident("Maria", "Santos", "09171234567", "maria@example.com")
  );
  const pedro = saveResident(
    residentRepository,
    makeResident("Pedro", "Reyes", "09181234567", "pedro@example.com")
  );

  return { databasePath, residentRepository, serviceRequestRepository, app, maria, pedro };
}

function cleanupHardeningSetup({ databasePath, residentRepository, serviceRequestRepository }) {
  residentRepository.close();
  serviceRequestRepository.close();
  removeDatabase(databasePath);
}

function withSetup(testBody) {
  return async () => {
    const setup = createHardeningSetup();

    try {
      await testBody(setup);
    } finally {
      cleanupHardeningSetup(setup);
    }
  };
}

function saveServiceRequest(setup, overrides = {}) {
  return setup.serviceRequestRepository.save(
    new ServiceRequest({
      residentId: setup.maria.id,
      serviceType: "Barangay Clearance",
      description: "Employment requirement",
      dateRequested: "2026-10-01",
      status: "Pending",
      ...overrides
    })
  );
}

// every persisted row of both tables, read straight from the repositories
function snapshot(setup) {
  return {
    residents: setup.residentRepository.findAll(),
    serviceRequests: setup.serviceRequestRepository.findAll()
  };
}

// no stack frames, SQL, or Node/Express error internals in a rendered page
function assertNoInternalDetails(text) {
  assert.doesNotMatch(text, /\bat [\w.<>]+ \(/);
  assert.doesNotMatch(text, /SyntaxError|URIError|PayloadTooLargeError|SQLITE|node_modules/);
  assert.doesNotMatch(text, /\b(SELECT|INSERT|UPDATE)\b .*\b(FROM|INTO|SET)\b/);
}

function countResidentRows(text) {
  return (text.match(/href="\/residents\/\d+\/edit"/g) ?? []).length;
}

// ---------------------------------------------------------------------------
// Category 1 - Invalid or Malformed Input
// ---------------------------------------------------------------------------
test(
  "T15-1 malformed requests are rejected with a controlled 4xx page and persist nothing",
  withSetup(async (setup) => {
    const before = snapshot(setup);

    // a JSON body that cannot be parsed, sent to a state-changing route
    const malformedJson = await request(setup.app)
      .post("/residents")
      .set("Content-Type", "application/json")
      .send('{"firstName": "Juan", "lastName":');

    assert.equal(malformedJson.statusCode, 400);
    assert.match(malformedJson.text, /Invalid Request/);
    assert.match(malformedJson.text, /Nothing was saved\./);
    assertNoInternalDetails(malformedJson.text);

    // a route identifier that cannot even be URL-decoded, on a workflow action
    const malformedPath = await request(setup.app)
      .post(`/service-requests/%E0%A4%A/complete`);

    assert.equal(malformedPath.statusCode, 400);
    assert.match(malformedPath.text, /Invalid Request/);
    assertNoInternalDetails(malformedPath.text);

    // a body larger than the parser accepts
    const oversized = await request(setup.app)
      .post("/service-requests")
      .type("form")
      .send({ residentId: String(setup.maria.id), description: "x".repeat(200_000) });

    assert.equal(oversized.statusCode, 413);
    assert.match(oversized.text, /Request Too Large/);
    assertNoInternalDetails(oversized.text);

    // nothing was created or modified by any of the rejected requests
    assert.deepEqual(snapshot(setup), before);

    // the application keeps serving normally afterwards
    const health = await request(setup.app).get("/health");
    assert.equal(health.statusCode, 200);
  })
);

// ---------------------------------------------------------------------------
// Category 2 - Rejected Mutation Protects Persistence
// ---------------------------------------------------------------------------
test(
  "T15-2 rejected Resident update with smuggled id/status and one invalid field changes nothing",
  withSetup(async (setup) => {
    const storedMaria = setup.residentRepository.findById(setup.maria.id);
    const storedPedro = setup.residentRepository.findById(setup.pedro.id);

    // valid new names + an invalid email, plus fields the form must never accept
    const response = await request(setup.app)
      .post(`/residents/${setup.maria.id}`)
      .type("form")
      .send({
        id: String(setup.pedro.id),
        status: "Inactive",
        firstName: "Maria Luisa",
        lastName: "Santos-Cruz",
        address: "Barangay Malaban",
        contactNumber: "09999999999",
        email: "not-an-email"
      });

    assert.equal(response.statusCode, 422);
    assert.match(response.text, /Email must be a valid email address/);
    assertNoInternalDetails(response.text);

    // retrieve again: the whole update was rejected (no partial write of the valid fields),
    // the id/status in the body were ignored, and the other Resident was not touched
    assert.deepEqual(setup.residentRepository.findById(setup.maria.id), storedMaria);
    assert.deepEqual(setup.residentRepository.findById(setup.pedro.id), storedPedro);
    assert.equal(setup.residentRepository.countAll(), 2);
  })
);

// ---------------------------------------------------------------------------
// Category 3 - Read-Only Request Safety
// ---------------------------------------------------------------------------
test(
  "T15-3 every browser GET page, and GET on mutation-only URLs, leaves persistence unchanged",
  withSetup(async (setup) => {
    const pending = saveServiceRequest(setup);
    const inProgress = saveServiceRequest(setup, { status: "In Progress", description: "Water leak" });

    setup.residentRepository.deactivateById(setup.pedro.id);
    const before = snapshot(setup);

    const readOnlyPages = [
      "/",
      "/health",
      "/dashboard",
      "/residents",
      "/residents?search=santos",
      "/residents?search=%20%20",
      "/residents/new",
      `/residents/${setup.maria.id}/edit`,
      `/residents/${setup.pedro.id}/edit`,
      "/service-requests",
      "/service-requests?search=clearance",
      "/service-requests?status=In%20Progress",
      "/service-requests?search=leak&status=In%20Progress",
      "/service-requests/new",
      `/service-requests/${pending.id}`,
      `/service-requests/${inProgress.id}`
    ];

    // read each page twice (simulating refresh) and confirm it renders
    for (const url of [...readOnlyPages, ...readOnlyPages]) {
      const response = await request(setup.app).get(url);
      assert.equal(response.statusCode, 200, `GET ${url}`);
    }

    // mutation URLs exist only as POST; a GET (link, refresh, prefetch) must not act
    const mutationOnlyUrls = [
      `/residents/${setup.maria.id}/deactivate`,
      `/service-requests/${pending.id}/start-processing`,
      `/service-requests/${pending.id}/cancel`,
      `/service-requests/${inProgress.id}/complete`
    ];

    for (const url of mutationOnlyUrls) {
      const response = await request(setup.app).get(url);
      assert.equal(response.statusCode, 404, `GET ${url}`);
    }

    // every row of both tables is exactly as it was
    assert.deepEqual(snapshot(setup), before);
    assert.equal(setup.residentRepository.findById(setup.maria.id).status, "Active");
    assert.equal(setup.serviceRequestRepository.findById(pending.id).status, "Pending");
    assert.equal(setup.serviceRequestRepository.findById(inProgress.id).status, "In Progress");
  })
);

// ---------------------------------------------------------------------------
// Category 4 - Cross-Feature Regression
// ---------------------------------------------------------------------------
test(
  "T15-4 Resident deactivation blocks new requests, keeps existing ones workable, and syncs the Dashboard",
  withSetup(async (setup) => {
    // Maria already has a request being processed
    const existing = saveServiceRequest(setup, { status: "In Progress" });

    // T12 -> T07: deactivate through the interface
    const deactivation = await request(setup.app).post(`/residents/${setup.maria.id}/deactivate`);
    assert.equal(deactivation.statusCode, 303);
    assert.equal(setup.residentRepository.findById(setup.maria.id).status, "Inactive");

    // T13 -> T09: the Inactive Resident can no longer submit, and nothing is persisted
    const submission = await request(setup.app)
      .post("/service-requests")
      .type("form")
      .send({
        residentId: String(setup.maria.id),
        serviceType: "Medical Assistance",
        description: "Hospital bill support",
        dateRequested: "2026-10-05"
      });

    assert.equal(submission.statusCode, 422);
    assert.match(submission.text, /Inactive Residents cannot submit new Service Requests\./);
    assert.equal(setup.serviceRequestRepository.countAll(), 1);

    // T13 -> T10: the request submitted while Active still follows the workflow
    const completion = await request(setup.app).post(`/service-requests/${existing.id}/complete`);
    assert.equal(completion.statusCode, 303);
    assert.equal(setup.serviceRequestRepository.findById(existing.id).status, "Completed");

    // T05/T12: the Inactive Resident stays persisted and searchable
    const search = await request(setup.app).get("/residents?search=maria");
    assert.equal(countResidentRows(search.text), 1);
    assert.match(search.text, /Inactive/);

    // T11/T13: the Completed request stays queryable by status filter
    const filtered = await request(setup.app).get("/service-requests?status=Completed");
    assert.match(filtered.text, new RegExp(`data-service-request-id="${existing.id}"`));

    // T14: the Dashboard reflects all of the above from persistence
    const dashboard = await request(setup.app).get("/dashboard");
    const metric = (name) => Number(new RegExp(`data-metric="${name}">(\\d+)<`).exec(dashboard.text)[1]);

    assert.equal(metric("residents-total"), 2);
    assert.equal(metric("residents-active"), 1);
    assert.equal(metric("residents-inactive"), 1);
    assert.equal(metric("service-requests-total"), 1);
    assert.equal(metric("service-requests-completed"), 1);
    assert.equal(metric("service-requests-open"), 0);
  })
);

// ---------------------------------------------------------------------------
// Category 5 - Repeatability / Boundary Behavior
// ---------------------------------------------------------------------------
test(
  "T15-5 Resident search treats % and _ literally (no-match boundary) while partial search still works",
  withSetup(async (setup) => {
    const ana = saveResident(
      setup.residentRepository,
      makeResident("Ana_Luz", "Garcia", "09191234567", "ana@example.com")
    );

    // "%" and "_" are LIKE wildcards; typed by a user they must be ordinary characters
    const percent = await request(setup.app).get("/residents?search=%25");
    assert.equal(percent.statusCode, 200);
    assert.equal(countResidentRows(percent.text), 0);
    assert.match(percent.text, /No Residents found\./);

    const underscore = await request(setup.app).get("/residents?search=_");
    assert.equal(countResidentRows(underscore.text), 1);
    assert.ok(underscore.text.includes(`href="/residents/${ana.id}/edit"`));

    // the repository applies the rule directly too, and repeated reads stay identical
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const results = setup.residentRepository.searchByName("%");
      assert.deepEqual(results, []);
    }

    // T05 behavior is unchanged: trimmed, partial, case-insensitive; blank lists all
    const partial = await request(setup.app).get("/residents?search=%20%20SANT%20");
    assert.equal(countResidentRows(partial.text), 1);
    assert.ok(partial.text.includes(`href="/residents/${setup.maria.id}/edit"`));

    const blank = await request(setup.app).get("/residents?search=%20");
    assert.equal(countResidentRows(blank.text), 3);
  })
);

// ---------------------------------------------------------------------------
// Additional regression: release from a fresh clone
// ---------------------------------------------------------------------------
test("T15-6 the database folder is created when missing (fresh clone has no data/ directory)", () => {
  const missingDirectory = path.join(os.tmpdir(), `csms-t15-${crypto.randomUUID()}`, "data");
  const databasePath = path.join(missingDirectory, "csms.db");

  assert.equal(fs.existsSync(missingDirectory), false);

  const database = openDatabase(databasePath);

  try {
    assert.equal(fs.existsSync(databasePath), true);
  } finally {
    database.close();
    fs.rmSync(path.dirname(missingDirectory), { recursive: true, force: true });
  }
});
