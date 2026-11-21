import test from "node:test";
import assert from "node:assert/strict";

import request from "supertest";

import { createApp } from "../src/app.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { createTemporaryDatabasePath, removeDatabase, makeResident, saveResident } from "../src/utils/testUtils.js";

// the real application wired to a ResidentRepository on a temporary SQLite file:
// HTTP -> controller -> T04-T07 services -> T02 validation -> T03 persistence.
// T15: the Service Request repository is also passed (same temporary file) so createApp
// never falls back to the permanent data/csms.db during tests.
function createInterfaceSetup() {
  const databasePath = createTemporaryDatabasePath();
  const repository = new ResidentRepository(databasePath);
  const serviceRequestRepository = new ServiceRequestRepository(databasePath);
  const app = createApp({ residentRepository: repository, serviceRequestRepository });

  return { databasePath, repository, serviceRequestRepository, app };
}

function cleanupInterfaceSetup({ databasePath, repository, serviceRequestRepository }) {
  repository.close();
  serviceRequestRepository.close();
  removeDatabase(databasePath);
}

function seedResidents(repository) {
  return {
    maria: saveResident(repository, makeResident("Maria", "Santos", "09171111111", "maria@example.com")),
    juan: saveResident(repository, makeResident("Juan", "Dela Cruz", "09172222222", "juan@example.com")),
    pedro: saveResident(repository, makeResident("Pedro", "Reyes", "09173333333", "pedro@example.com"))
  };
}

const validForm = {
  firstName: "Ana",
  lastName: "Garcia",
  address: "Barangay San Jose",
  contactNumber: "09181234567",
  email: "ana@example.com"
};

// ids that appear in Edit links, in page order
function listedIds(html) {
  return [...html.matchAll(/href="\/residents\/(\d+)\/edit"/g)].map((match) => Number(match[1]));
}

// Test 1: Resident Management Page Loads Successfully
test("Resident Management page loads successfully", async () => {
  const setup = createInterfaceSetup();

  try {
    const response = await request(setup.app).get("/residents");

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"], /text\/html/);
    assert.match(response.text, /<h1[^>]*>Resident Management<\/h1>/);
    assert.match(response.text, /href="\/residents\/new"[^>]*>Register Resident</);
    assert.match(response.text, /<input[^>]*name="search"/);
    // empty database renders a friendly message, not an error
    assert.match(response.text, /No Residents found\./);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 2: Resident List Displays Persisted Residents (in T05 order)
test("Resident list displays persisted Residents in T05 order", async () => {
  const setup = createInterfaceSetup();

  try {
    const { maria, juan, pedro } = seedResidents(setup.repository);

    const response = await request(setup.app).get("/residents");

    assert.equal(response.statusCode, 200);

    for (const resident of [maria, juan, pedro]) {
      assert.match(response.text, new RegExp(`<td[^>]*>${resident.id}</td>`));
      assert.ok(response.text.includes(resident.firstName));
      assert.ok(response.text.includes(resident.lastName));
      assert.ok(response.text.includes(resident.address));
      assert.ok(response.text.includes(resident.contactNumber));
      assert.ok(response.text.includes(resident.email));
    }

    // lastName ASC: Dela Cruz, Reyes, Santos
    assert.deepEqual(listedIds(response.text), [juan.id, pedro.id, maria.id]);
    assert.match(response.text, />Active</);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 3: Resident Search Uses Existing Search Behavior
test("Resident search is partial and case-insensitive", async () => {
  const setup = createInterfaceSetup();

  try {
    const { maria, juan, pedro } = seedResidents(setup.repository);

    for (const term of ["SANT", "mar", "   santos   "]) {
      const response = await request(setup.app).get("/residents").query({ search: term });

      assert.equal(response.statusCode, 200);
      assert.deepEqual(listedIds(response.text), [maria.id], `term: ${term}`);
      assert.ok(!response.text.includes(juan.email));
      assert.ok(!response.text.includes(pedro.email));
    }

    // no match renders normally with a friendly message
    const noMatch = await request(setup.app).get("/residents").query({ search: "zzz" });
    assert.equal(noMatch.statusCode, 200);
    assert.match(noMatch.text, /No Residents found\./);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 4: Blank Search Displays All Residents
test("blank search displays all Residents", async () => {
  const setup = createInterfaceSetup();

  try {
    seedResidents(setup.repository);

    const listing = await request(setup.app).get("/residents");
    const blank = await request(setup.app).get("/residents").query({ search: "      " });

    assert.equal(blank.statusCode, 200);
    assert.equal(listedIds(blank.text).length, 3);
    assert.deepEqual(listedIds(blank.text), listedIds(listing.text));
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 5: Registration Form Is Accessible
test("registration form renders the five labelled Resident fields", async () => {
  const setup = createInterfaceSetup();

  try {
    const response = await request(setup.app).get("/residents/new");

    assert.equal(response.statusCode, 200);
    assert.match(response.text, /<form[^>]*method="post"[^>]*action="\/residents"/);

    for (const [field, label] of [
      ["firstName", "First Name"],
      ["lastName", "Last Name"],
      ["address", "Address"],
      ["contactNumber", "Contact Number"],
      ["email", "Email"]
    ]) {
      assert.match(response.text, new RegExp(`<label[^>]*for="${field}"[^>]*>${label}</label>`));
      assert.match(response.text, new RegExp(`name="${field}"`));
    }

    assert.doesNotMatch(response.text, /name="id"/);
    assert.doesNotMatch(response.text, /name="status"/);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 6: Valid Registration Persists Resident
test("valid registration persists an Active Resident and redirects", async () => {
  const setup = createInterfaceSetup();

  try {
    // id and status sent by a crafted request are ignored
    const response = await request(setup.app)
      .post("/residents")
      .type("form")
      .send({ ...validForm, id: "999", status: "Inactive" });

    assert.equal(response.statusCode, 303);
    assert.equal(response.headers.location, "/residents?notice=registered");

    const residents = setup.repository.findAll();
    assert.equal(residents.length, 1);
    assert.ok(Number.isInteger(residents[0].id));
    assert.notEqual(residents[0].id, 999);
    assert.equal(residents[0].status, "Active");
    assert.equal(residents[0].firstName, "Ana");

    const page = await request(setup.app).get(response.headers.location);
    assert.match(page.text, /Resident registered successfully\./);
    assert.deepEqual(listedIds(page.text), [residents[0].id]);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 7: Invalid Registration Shows Validation Feedback and Does Not Persist
test("invalid registration shows feedback, keeps entered values and persists nothing", async () => {
  const setup = createInterfaceSetup();

  try {
    const response = await request(setup.app)
      .post("/residents")
      .type("form")
      .send({ ...validForm, firstName: "   ", contactNumber: "12345", email: "not-an-email" });

    assert.equal(response.statusCode, 422);
    assert.match(response.text, /First name is required\./);
    assert.match(response.text, /Contact number must follow the format 09XXXXXXXXX/);
    assert.match(response.text, /Email must be a valid email address/);

    // valid entries are kept so the user does not retype them
    assert.match(response.text, /value="Garcia"/);
    assert.match(response.text, /value="Barangay San Jose"/);

    assert.deepEqual(setup.repository.findAll(), []);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 8: Edit Form Displays Existing Resident Information
test("edit form shows current values with read-only id and status", async () => {
  const setup = createInterfaceSetup();

  try {
    const { maria } = seedResidents(setup.repository);

    const response = await request(setup.app).get(`/residents/${maria.id}/edit`);

    assert.equal(response.statusCode, 200);
    assert.match(response.text, /value="Maria"/);
    assert.match(response.text, /value="Santos"/);
    assert.match(response.text, /value="Barangay Santo Tomas"/);
    assert.match(response.text, /value="09171111111"/);
    assert.match(response.text, /value="maria@example.com"/);

    // id and status are shown as text, never as editable inputs
    assert.match(response.text, new RegExp(`<dd>${maria.id}</dd>`));
    assert.match(response.text, />Active</);
    assert.doesNotMatch(response.text, /name="id"/);
    assert.doesNotMatch(response.text, /name="status"/);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 9: Valid Update Persists Changes
test("valid update persists changes and preserves id and status", async () => {
  const setup = createInterfaceSetup();

  try {
    const { maria } = seedResidents(setup.repository);
    setup.repository.deactivateById(maria.id);

    const response = await request(setup.app)
      .post(`/residents/${maria.id}`)
      .type("form")
      .send({
        firstName: "Maria Luisa",
        lastName: "Santos",
        address: "Barangay Malaban",
        contactNumber: "09999999999",
        email: "marialuisa@example.com",
        id: "777",
        status: "Active"
      });

    assert.equal(response.statusCode, 303);
    assert.equal(response.headers.location, "/residents?notice=updated");

    const stored = setup.repository.findById(maria.id);
    assert.equal(stored.id, maria.id);
    assert.equal(stored.status, "Inactive");
    assert.equal(stored.firstName, "Maria Luisa");
    assert.equal(stored.address, "Barangay Malaban");
    assert.equal(stored.contactNumber, "09999999999");
    assert.equal(stored.email, "marialuisa@example.com");
    assert.equal(setup.repository.findById(777), null);

    const page = await request(setup.app).get(response.headers.location);
    assert.match(page.text, /Resident information updated successfully\./);
    assert.ok(page.text.includes("Maria Luisa"));
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 10: Invalid Update Does Not Modify Resident
test("invalid update shows feedback and leaves the Resident unchanged", async () => {
  const setup = createInterfaceSetup();

  try {
    const { maria } = seedResidents(setup.repository);
    const before = setup.repository.findById(maria.id);

    const response = await request(setup.app)
      .post(`/residents/${maria.id}`)
      .type("form")
      .send({
        firstName: "Maria",
        lastName: "",
        address: "New Address",
        contactNumber: "0917",
        email: "maria@example.com"
      });

    assert.equal(response.statusCode, 422);
    assert.match(response.text, /Last name is required\./);
    assert.match(response.text, /Contact number must follow the format 09XXXXXXXXX/);
    // the form stays available for correction with the entered values
    assert.match(response.text, new RegExp(`action="/residents/${maria.id}"`));
    assert.match(response.text, /value="New Address"/);

    assert.deepEqual(setup.repository.findById(maria.id), before);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 11: Missing Resident Edit Is Handled Safely
test("missing Resident edit returns a controlled 404 page", async () => {
  const setup = createInterfaceSetup();

  try {
    for (const path of ["/residents/9999/edit", "/residents/abc/edit", "/residents/0/edit"]) {
      const response = await request(setup.app).get(path);

      assert.equal(response.statusCode, 404, path);
      assert.match(response.text, /The requested Resident does not exist\./);
      assert.doesNotMatch(response.text, /Error:|at .*\.js/);
    }

    const update = await request(setup.app).post("/residents/9999").type("form").send(validForm);
    assert.equal(update.statusCode, 404);

    const deactivate = await request(setup.app).post("/residents/9999/deactivate");
    assert.equal(deactivate.statusCode, 404);

    assert.deepEqual(setup.repository.findAll(), []);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 12: Active Resident Can Be Deactivated Through the Interface
test("Active Resident can be deactivated and stays listed", async () => {
  const setup = createInterfaceSetup();

  try {
    const { maria } = seedResidents(setup.repository);

    const response = await request(setup.app).post(`/residents/${maria.id}/deactivate`);

    assert.equal(response.statusCode, 303);
    assert.equal(response.headers.location, "/residents?notice=deactivated");

    const stored = setup.repository.findById(maria.id);
    assert.deepEqual({ ...stored }, { ...maria, status: "Inactive" });

    const page = await request(setup.app).get(response.headers.location);
    assert.match(page.text, /Resident deactivated successfully\./);
    assert.ok(listedIds(page.text).includes(maria.id));

    // repeating the request directly is safe (T07 idempotency)
    const repeat = await request(setup.app).post(`/residents/${maria.id}/deactivate`);
    assert.equal(repeat.headers.location, "/residents?notice=already-inactive");
    assert.equal(setup.repository.findById(maria.id).status, "Inactive");
    assert.equal(setup.repository.findAll().length, 3);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 13: Inactive Resident Remains Visible
test("Inactive Resident remains listed and searchable with Inactive status", async () => {
  const setup = createInterfaceSetup();

  try {
    const { maria, juan } = seedResidents(setup.repository);
    await request(setup.app).post(`/residents/${maria.id}/deactivate`);

    const search = await request(setup.app).get("/residents").query({ search: "santos" });

    assert.deepEqual(listedIds(search.text), [maria.id]);
    assert.match(search.text, />Inactive</);
    // no Deactivate (or reactivation) action is offered for an Inactive Resident
    assert.doesNotMatch(search.text, new RegExp(`/residents/${maria.id}/deactivate`));
    assert.doesNotMatch(search.text, /Activate|Reactivate/);

    const listing = await request(setup.app).get("/residents");
    assert.ok(listedIds(listing.text).includes(maria.id));
    // the still-Active Resident keeps its Deactivate action
    assert.match(listing.text, new RegExp(`/residents/${juan.id}/deactivate`));
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 14: GET Requests Do Not Deactivate Residents
test("GET requests never change Resident state", async () => {
  const setup = createInterfaceSetup();

  try {
    const { maria } = seedResidents(setup.repository);
    const before = setup.repository.findAll();

    await request(setup.app).get("/residents");
    await request(setup.app).get("/residents").query({ search: "maria" });
    await request(setup.app).get("/residents/new");
    await request(setup.app).get(`/residents/${maria.id}/edit`);

    // deactivation is not reachable through GET
    const getDeactivate = await request(setup.app).get(`/residents/${maria.id}/deactivate`);
    assert.equal(getDeactivate.statusCode, 404);

    assert.deepEqual(setup.repository.findAll(), before);
    assert.equal(setup.repository.findById(maria.id).status, "Active");
  } finally {
    cleanupInterfaceSetup(setup);
  }
});
