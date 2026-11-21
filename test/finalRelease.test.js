import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import request from "supertest";

import { createApp } from "../src/app.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { createTemporaryDatabasePath, removeDatabase } from "../src/utils/testUtils.js";

// T16 Final System Release.
// Both tests run the real application (HTTP -> controllers -> services -> SQLite)
// on their own temporary database and remove it afterwards.

const RELEASE_VERSION = "1.0.0";

// one running CSMS instance on the given database file
function startApplication(databasePath) {
  const residentRepository = new ResidentRepository(databasePath);
  const serviceRequestRepository = new ServiceRequestRepository(databasePath);
  const app = createApp({ residentRepository, serviceRequestRepository });

  return {
    app,
    residentRepository,
    serviceRequestRepository,
    stop() {
      residentRepository.close();
      serviceRequestRepository.close();
    }
  };
}

function dashboardMetric(html, name) {
  const match = new RegExp(`data-metric="${name}">(\\d+)<`).exec(html);
  assert.ok(match, `Dashboard metric ${name} is shown`);
  return Number(match[1]);
}

function listedServiceRequestIds(html) {
  return [...html.matchAll(/data-service-request-id="(\d+)"/g)].map((match) => Number(match[1]));
}

// ---------------------------------------------------------------------------
// T16 Final Examination integration test
// ---------------------------------------------------------------------------
test(
  "registered Resident's Service Request workflow outcomes survive an application restart and drive search, details and Dashboard",
  async () => {
    const databasePath = createTemporaryDatabasePath();
    let running = startApplication(databasePath);

    try {
      // known starting state: an empty database
      assert.equal(running.residentRepository.countAll(), 0);
      assert.equal(running.serviceRequestRepository.countAll(), 0);

      // T04/T12 Resident registration through the browser form
      const registration = await request(running.app)
        .post("/residents")
        .type("form")
        .send({
          firstName: "Lorna",
          lastName: "Villanueva",
          address: "Barangay Malaban",
          contactNumber: "09175550123",
          email: "lorna@example.com"
        });

      assert.equal(registration.statusCode, 303);
      const [lorna] = running.residentRepository.findAll();
      assert.equal(lorna.status, "Active");

      // T09/T13 two submissions for the new Resident, each stored as Pending
      for (const submission of [
        { serviceType: "Barangay Clearance", description: "Employment requirement", dateRequested: "2026-11-02" },
        { serviceType: "Medical Assistance", description: "Hospital bill support", dateRequested: "2026-11-03" }
      ]) {
        const response = await request(running.app)
          .post("/service-requests")
          .type("form")
          .send({ residentId: String(lorna.id), ...submission });

        assert.equal(response.statusCode, 303);
      }

      const clearance = running.serviceRequestRepository.search({ searchTerm: "clearance" })[0];
      const medical = running.serviceRequestRepository.search({ searchTerm: "medical" })[0];
      assert.equal(clearance.residentId, lorna.id);
      assert.equal(medical.residentId, lorna.id);
      assert.equal(clearance.status, "Pending");
      assert.equal(medical.status, "Pending");

      // T10/T13 workflow: clearance Pending -> In Progress -> Completed, medical Pending -> Cancelled
      for (const action of ["start-processing", "complete"]) {
        const response = await request(running.app).post(`/service-requests/${clearance.id}/${action}`);
        assert.equal(response.statusCode, 303, action);
      }

      const cancellation = await request(running.app).post(`/service-requests/${medical.id}/cancel`);
      assert.equal(cancellation.statusCode, 303);

      // T10 terminal protection: a Completed request cannot be cancelled
      const rejected = await request(running.app).post(`/service-requests/${clearance.id}/cancel`);
      assert.equal(rejected.statusCode, 409);

      // restart: discard the running instance and open a new one on the same database file,
      // so everything below is read back from SQLite, not from objects still in memory
      running.stop();
      running = startApplication(databasePath);

      // T03/T08 persisted final state
      assert.equal(running.serviceRequestRepository.findById(clearance.id).status, "Completed");
      assert.equal(running.serviceRequestRepository.findById(medical.id).status, "Cancelled");
      assert.equal(running.residentRepository.findById(lorna.id).status, "Active");
      assert.equal(running.serviceRequestRepository.countAll(), 2);

      // T11/T13 status filter returns exactly the matching persisted request
      const completed = await request(running.app).get("/service-requests?status=Completed");
      assert.deepEqual(listedServiceRequestIds(completed.text), [clearance.id]);

      const cancelled = await request(running.app).get("/service-requests?status=Cancelled");
      assert.deepEqual(listedServiceRequestIds(cancelled.text), [medical.id]);

      // T13 details page shows the terminal state and offers no further actions
      const details = await request(running.app).get(`/service-requests/${clearance.id}`);
      assert.equal(details.statusCode, 200);
      assert.match(details.text, /Completed is a final state\./);
      assert.doesNotMatch(details.text, new RegExp(`action="/service-requests/${clearance.id}/`));

      // T14 Dashboard aggregates the persisted outcome; nothing is left open
      const dashboard = await request(running.app).get("/dashboard");
      assert.equal(dashboardMetric(dashboard.text, "residents-total"), 1);
      assert.equal(dashboardMetric(dashboard.text, "residents-active"), 1);
      assert.equal(dashboardMetric(dashboard.text, "service-requests-total"), 2);
      assert.equal(dashboardMetric(dashboard.text, "service-requests-completed"), 1);
      assert.equal(dashboardMetric(dashboard.text, "service-requests-cancelled"), 1);
      assert.equal(dashboardMetric(dashboard.text, "service-requests-open"), 0);

      // recent list uses the T11 order: newest date first
      assert.deepEqual(listedServiceRequestIds(dashboard.text), [medical.id, clearance.id]);
    } finally {
      running.stop();
      removeDatabase(databasePath);
    }
  }
);

// ---------------------------------------------------------------------------
// T16 release-version verification
// ---------------------------------------------------------------------------
test("CSMS identifies itself as release 1.0.0 in /health and on every managed page", async () => {
  const databasePath = createTemporaryDatabasePath();
  const running = startApplication(databasePath);

  try {
    // the authoritative source (package.json) holds the release version
    const manifest = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(manifest.version, RELEASE_VERSION);

    // /health: application identity, release version and healthy status, nothing more
    const health = await request(running.app).get("/health");
    assert.equal(health.statusCode, 200);
    assert.match(health.headers["content-type"], /application\/json/);
    assert.deepEqual(health.body, {
      status: "ok",
      application: "Community Services Management System",
      version: RELEASE_VERSION
    });
    assert.doesNotMatch(health.text, /password|secret|token|key|\.db|\.sqlite|\/home\/|[A-Z]:\\|stack/i);

    // the browser interface shows the same version on every page using the shared layout
    for (const url of ["/dashboard", "/residents", "/residents/new", "/service-requests", "/service-requests/new"]) {
      const page = await request(running.app).get(url);
      assert.equal(page.statusCode, 200, url);
      assert.match(page.text, /<span data-release-version>v1\.0\.0<\/span>/, url);
    }

    // controlled error pages share the layout too
    const missing = await request(running.app).get("/service-requests/999999");
    assert.equal(missing.statusCode, 404);
    assert.match(missing.text, /data-release-version>v1\.0\.0</);
  } finally {
    running.stop();
    removeDatabase(databasePath);
  }
});
