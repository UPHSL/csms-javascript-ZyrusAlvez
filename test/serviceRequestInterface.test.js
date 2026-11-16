import test from "node:test";
import assert from "node:assert/strict";

import request from "supertest";

import { createApp } from "../src/app.js";
import { ServiceRequest } from "../src/models/ServiceRequest.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { createTemporaryDatabasePath, removeDatabase, makeValidResident, saveResident } from "../src/utils/testUtils.js";

// the real application on a temporary SQLite file:
// HTTP -> controller -> T09/T10/T11 services -> validation/eligibility -> persistence
function createInterfaceSetup() {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const serviceRequestRepository = new ServiceRequestRepository(databasePath);
  const app = createApp({ residentRepository, serviceRequestRepository });

  const activeResident = saveResident(residentRepository, makeValidResident());
  const inactiveResident = saveResident(
    residentRepository,
    makeValidResident({ firstName: "Pedro", email: "pedro@example.com", status: "Inactive" })
  );

  return { databasePath, residentRepository, serviceRequestRepository, app, activeResident, inactiveResident };
}

function cleanupInterfaceSetup({ databasePath, residentRepository, serviceRequestRepository }) {
  residentRepository.close();
  serviceRequestRepository.close();
  removeDatabase(databasePath);
}

// persists directly through the T09 repository (fixture setup)
function persist(setup, overrides = {}) {
  return setup.serviceRequestRepository.save(
    new ServiceRequest({
      residentId: setup.activeResident.id,
      serviceType: "Barangay Clearance",
      description: "Employment requirement",
      dateRequested: "2026-09-15",
      status: "Pending",
      ...overrides
    })
  );
}

// ids of the rows rendered in the Service Request table, in page order
function listedIds(html) {
  return [...html.matchAll(/data-service-request-id="(\d+)"/g)].map((match) => Number(match[1]));
}

function validForm(setup, overrides = {}) {
  return {
    residentId: String(setup.activeResident.id),
    serviceType: "Certificate of Residency",
    description: "Needed for a scholarship application.",
    dateRequested: "2026-11-17",
    ...overrides
  };
}

// runs a workflow action through the interface (POST)
function postAction(setup, id, action) {
  return request(setup.app).post(`/service-requests/${id}/${action}`);
}

// Test 1: Service Request Management Page Loads
test("Service Request Management page loads", async () => {
  const setup = createInterfaceSetup();

  try {
    const response = await request(setup.app).get("/service-requests");

    assert.equal(response.statusCode, 200);
    assert.match(response.text, /<h1[^>]*>Service Request Management<\/h1>/);
    assert.match(response.text, /href="\/service-requests\/new"[^>]*>Submit Service Request</);
    assert.match(response.text, /<input[^>]*name="search"/);
    assert.match(response.text, /<select[^>]*name="status"/);
    assert.match(response.text, /<option value="">All Statuses<\/option>/);
    for (const status of ["Pending", "In Progress", "Completed", "Cancelled"]) {
      assert.match(response.text, new RegExp(`<option value="${status}"\\s*>${status}</option>`));
    }
    // navigation between the two modules
    assert.match(response.text, /href="\/residents"[^>]*>Residents</);
    // empty listing renders a friendly message
    assert.match(response.text, /No Service Requests found\./);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 2: Persisted Service Requests Are Displayed
test("persisted Service Requests are displayed with required columns", async () => {
  const setup = createInterfaceSetup();

  try {
    const clearance = persist(setup, { serviceType: "Barangay Clearance", dateRequested: "2026-09-15" });
    const assistance = persist(setup, {
      serviceType: "Community Assistance",
      description: "Medical support",
      dateRequested: "2026-09-12",
      status: "In Progress"
    });

    const response = await request(setup.app).get("/service-requests");

    assert.equal(response.statusCode, 200);
    assert.deepEqual(new Set(listedIds(response.text)), new Set([clearance.id, assistance.id]));

    for (const header of ["ID", "Resident ID", "Service Type", "Description", "Date Requested", "Status", "Actions"]) {
      assert.match(response.text, new RegExp(`<th[^>]*>${header}</th>`));
    }

    assert.match(response.text, new RegExp(`<td>${setup.activeResident.id}</td>`));
    assert.ok(response.text.includes("Barangay Clearance"));
    assert.ok(response.text.includes("Community Assistance"));
    assert.ok(response.text.includes("2026-09-12"));
    assert.match(response.text, />Pending</);
    assert.match(response.text, />In Progress</);
    assert.match(response.text, new RegExp(`href="/service-requests/${clearance.id}"[^>]*>View<`));
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 3: Required Ordering Is Preserved
test("listing preserves dateRequested DESC, then id DESC", async () => {
  const setup = createInterfaceSetup();

  try {
    const oldest = persist(setup, { dateRequested: "2026-09-10" });
    const sameDateLower = persist(setup, { dateRequested: "2026-09-18" });
    const middle = persist(setup, { dateRequested: "2026-09-15" });
    const sameDateHigher = persist(setup, { dateRequested: "2026-09-18" });

    const response = await request(setup.app).get("/service-requests");

    assert.deepEqual(listedIds(response.text), [sameDateHigher.id, sameDateLower.id, middle.id, oldest.id]);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 4: Text Search Uses T11 Behavior
test("text search is partial, case-insensitive and covers type and description", async () => {
  const setup = createInterfaceSetup();

  try {
    const clearance = persist(setup, {
      serviceType: "Barangay Clearance",
      description: "Requesting barangay clearance for employment requirements."
    });
    const assistance = persist(setup, {
      serviceType: "Community Assistance",
      description: "Medical support"
    });

    for (const term of ["cLeAr", "EMPLOY", "   clearance   "]) {
      const response = await request(setup.app).get("/service-requests").query({ search: term });

      assert.equal(response.statusCode, 200);
      assert.deepEqual(listedIds(response.text), [clearance.id], `term: ${term}`);
      assert.ok(!listedIds(response.text).includes(assistance.id));
    }

    // the search term stays visible in the form
    const kept = await request(setup.app).get("/service-requests").query({ search: "clear" });
    assert.match(kept.text, /name="search"[^>]*value="clear"/);

    // blank search lists everything; no match renders an empty-state message
    const blank = await request(setup.app).get("/service-requests").query({ search: "    " });
    assert.equal(listedIds(blank.text).length, 2);

    const none = await request(setup.app).get("/service-requests").query({ search: "zzz" });
    assert.equal(none.statusCode, 200);
    assert.match(none.text, /No Service Requests found\./);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 5: Status Filter Uses T11 Behavior
test("status filter shows only the selected status", async () => {
  const setup = createInterfaceSetup();

  try {
    const byStatus = {};
    for (const status of ["Pending", "In Progress", "Completed", "Cancelled"]) {
      byStatus[status] = persist(setup, { status });
    }

    for (const [status, serviceRequest] of Object.entries(byStatus)) {
      const response = await request(setup.app).get("/service-requests").query({ status });

      assert.equal(response.statusCode, 200);
      assert.deepEqual(listedIds(response.text), [serviceRequest.id], status);
      // the selected status stays selected
      assert.match(response.text, new RegExp(`<option value="${status}" selected>`));
    }

    // "All Statuses" (empty value) is unfiltered
    const all = await request(setup.app).get("/service-requests").query({ status: "" });
    assert.equal(listedIds(all.text).length, 4);

    // an unsupported filter is reported, not silently accepted
    const unsupported = await request(setup.app).get("/service-requests").query({ status: "Approved" });
    assert.equal(unsupported.statusCode, 400);
    assert.match(unsupported.text, /Unsupported status filter/);
    assert.deepEqual(listedIds(unsupported.text), []);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 6: Combined Search and Status Filter Works
test("combined search and status filter uses text AND status", async () => {
  const setup = createInterfaceSetup();

  try {
    const both = persist(setup, { serviceType: "Barangay Clearance", status: "Pending" });
    persist(setup, { serviceType: "Barangay Clearance", status: "Completed" }); // text only
    persist(setup, { serviceType: "Community Assistance", description: "Food pack", status: "Pending" }); // status only
    persist(setup, { serviceType: "Certificate of Residency", description: "Bank", status: "Cancelled" }); // neither

    const response = await request(setup.app)
      .get("/service-requests")
      .query({ search: "clearance", status: "Pending" });

    assert.deepEqual(listedIds(response.text), [both.id]);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 7: Submission Form Is Accessible
test("submission form has the four labelled fields and no id/status inputs", async () => {
  const setup = createInterfaceSetup();

  try {
    const response = await request(setup.app).get("/service-requests/new");

    assert.equal(response.statusCode, 200);
    assert.match(response.text, /<form[^>]*method="post"[^>]*action="\/service-requests"/);

    for (const [field, label] of [
      ["residentId", "Resident ID"],
      ["serviceType", "Service Type"],
      ["description", "Description"],
      ["dateRequested", "Date Requested"]
    ]) {
      assert.match(response.text, new RegExp(`<label[^>]*for="${field}"[^>]*>${label}</label>`));
      assert.match(response.text, new RegExp(`name="${field}"`));
    }

    assert.match(response.text, /<textarea[^>]*name="description"/);
    assert.match(response.text, /name="dateRequested" type="date"/);
    assert.doesNotMatch(response.text, /name="id"/);
    assert.doesNotMatch(response.text, /name="status"/);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 8: Valid Submission Persists a Pending Request
test("valid submission persists a Pending request with a generated id", async () => {
  const setup = createInterfaceSetup();

  try {
    // crafted id/status values are ignored
    const response = await request(setup.app)
      .post("/service-requests")
      .type("form")
      .send({ ...validForm(setup), id: "999", status: "Completed" });

    assert.equal(response.statusCode, 303);
    assert.equal(response.headers.location, "/service-requests?notice=submitted");

    const stored = setup.serviceRequestRepository.findAll();
    assert.equal(stored.length, 1);
    assert.ok(Number.isInteger(stored[0].id));
    assert.notEqual(stored[0].id, 999);
    assert.deepEqual({ ...stored[0] }, {
      id: stored[0].id,
      residentId: setup.activeResident.id,
      serviceType: "Certificate of Residency",
      description: "Needed for a scholarship application.",
      dateRequested: "2026-11-17",
      status: "Pending"
    });

    const page = await request(setup.app).get(response.headers.location);
    assert.match(page.text, /Service Request submitted successfully\./);
    assert.deepEqual(listedIds(page.text), [stored[0].id]);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 9: Invalid Submission Shows Validation Feedback
test("invalid submission shows feedback, keeps values and persists nothing", async () => {
  const setup = createInterfaceSetup();

  try {
    const response = await request(setup.app)
      .post("/service-requests")
      .type("form")
      .send(validForm(setup, { serviceType: "   ", description: "", dateRequested: "2026-02-30" }));

    assert.equal(response.statusCode, 422);
    assert.match(response.text, /Service type is required\./);
    assert.match(response.text, /Description is required\./);
    assert.match(response.text, /Date requested must be a valid date/);
    // the Resident ID the user typed is kept
    assert.match(response.text, new RegExp(`name="residentId"[^>]*value="${setup.activeResident.id}"`));

    const badResidentId = await request(setup.app)
      .post("/service-requests")
      .type("form")
      .send(validForm(setup, { residentId: "abc" }));
    assert.equal(badResidentId.statusCode, 422);
    assert.match(badResidentId.text, /Resident ID must be a positive whole number\./);
    assert.match(badResidentId.text, /Certificate of Residency/);

    assert.deepEqual(setup.serviceRequestRepository.findAll(), []);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 10: Missing Resident Submission Is Rejected
test("submission for a missing Resident is rejected", async () => {
  const setup = createInterfaceSetup();

  try {
    const response = await request(setup.app)
      .post("/service-requests")
      .type("form")
      .send(validForm(setup, { residentId: "9999" }));

    assert.equal(response.statusCode, 422);
    assert.match(response.text, /Resident not found\./);
    assert.doesNotMatch(response.text, /SQLITE|stack|at .*\.js/i);
    assert.deepEqual(setup.serviceRequestRepository.findAll(), []);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 11: Inactive Resident Submission Is Rejected
test("submission for an Inactive Resident is rejected", async () => {
  const setup = createInterfaceSetup();

  try {
    const response = await request(setup.app)
      .post("/service-requests")
      .type("form")
      .send(validForm(setup, { residentId: String(setup.inactiveResident.id) }));

    assert.equal(response.statusCode, 422);
    assert.match(response.text, /Inactive Residents cannot submit new Service Requests\./);
    assert.deepEqual(setup.serviceRequestRepository.findAll(), []);
    assert.equal(setup.residentRepository.findById(setup.inactiveResident.id).status, "Inactive");
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 12: Existing Service Request Details Can Be Viewed
test("details page shows every Service Request field", async () => {
  const setup = createInterfaceSetup();

  try {
    const saved = persist(setup, {
      serviceType: "Barangay Clearance",
      description: "Requesting barangay clearance for employment requirements.",
      dateRequested: "2026-09-18",
      status: "In Progress"
    });

    const response = await request(setup.app).get(`/service-requests/${saved.id}`);

    assert.equal(response.statusCode, 200);
    assert.match(response.text, new RegExp(`<dt>ID</dt>\\s*<dd>${saved.id}</dd>`));
    assert.match(response.text, new RegExp(`<dt>Resident ID</dt>\\s*<dd>${setup.activeResident.id}</dd>`));
    assert.match(response.text, /<dt>Service Type<\/dt>\s*<dd>Barangay Clearance<\/dd>/);
    assert.match(response.text, /Requesting barangay clearance for employment requirements\./);
    assert.match(response.text, /<dt>Date Requested<\/dt>\s*<dd>2026-09-18<\/dd>/);
    assert.match(response.text, /<dt>Status<\/dt>\s*<dd>In Progress<\/dd>/);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 13: Missing Service Request View Is Handled Safely
test("missing Service Request view returns a controlled 404", async () => {
  const setup = createInterfaceSetup();

  try {
    for (const path of ["/service-requests/9999", "/service-requests/abc", "/service-requests/0"]) {
      const response = await request(setup.app).get(path);

      assert.equal(response.statusCode, 404, path);
      assert.match(response.text, /The requested Service Request does not exist\./);
      assert.doesNotMatch(response.text, /Error:|at .*\.js/);
    }

    // processing a missing id is also a controlled 404
    for (const action of ["start-processing", "complete", "cancel"]) {
      const response = await postAction(setup, 9999, action);
      assert.equal(response.statusCode, 404, action);
    }

    assert.deepEqual(setup.serviceRequestRepository.findAll(), []);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 14: Pending Request Can Start Processing
test("Pending request can start processing through the interface", async () => {
  const setup = createInterfaceSetup();

  try {
    const pending = persist(setup);

    const before = await request(setup.app).get(`/service-requests/${pending.id}`);
    assert.match(before.text, />Start Processing</);
    assert.match(before.text, />Cancel</);
    assert.doesNotMatch(before.text, />Complete</);

    const response = await postAction(setup, pending.id, "start-processing");

    assert.equal(response.statusCode, 303);
    assert.equal(response.headers.location, `/service-requests/${pending.id}?notice=started`);
    // only the status changed
    assert.deepEqual({ ...setup.serviceRequestRepository.findById(pending.id) }, { ...pending, status: "In Progress" });

    const page = await request(setup.app).get(response.headers.location);
    assert.match(page.text, /Service Request is now In Progress\./);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 15: Pending Request Can Be Cancelled
test("Pending request can be cancelled through the interface", async () => {
  const setup = createInterfaceSetup();

  try {
    const pending = persist(setup);

    const response = await postAction(setup, pending.id, "cancel");

    assert.equal(response.statusCode, 303);
    assert.deepEqual({ ...setup.serviceRequestRepository.findById(pending.id) }, { ...pending, status: "Cancelled" });
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 16: In-Progress Request Can Be Completed
test("In Progress request can be completed through the interface", async () => {
  const setup = createInterfaceSetup();

  try {
    const pending = persist(setup);
    // reach In Progress legitimately through the T10 workflow
    await postAction(setup, pending.id, "start-processing");

    const inProgress = await request(setup.app).get(`/service-requests/${pending.id}`);
    assert.match(inProgress.text, />Complete</);
    assert.match(inProgress.text, />Cancel</);
    assert.doesNotMatch(inProgress.text, />Start Processing</);

    const response = await postAction(setup, pending.id, "complete");

    assert.equal(response.statusCode, 303);
    assert.deepEqual({ ...setup.serviceRequestRepository.findById(pending.id) }, { ...pending, status: "Completed" });

    const page = await request(setup.app).get(response.headers.location);
    assert.match(page.text, /Service Request completed successfully\./);
    assert.doesNotMatch(page.text, />(Start Processing|Complete|Cancel)</);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 17: In-Progress Request Can Be Cancelled
test("In Progress request can be cancelled through the interface", async () => {
  const setup = createInterfaceSetup();

  try {
    const pending = persist(setup);
    await postAction(setup, pending.id, "start-processing");

    const response = await postAction(setup, pending.id, "cancel");

    assert.equal(response.statusCode, 303);
    assert.deepEqual({ ...setup.serviceRequestRepository.findById(pending.id) }, { ...pending, status: "Cancelled" });

    const page = await request(setup.app).get(response.headers.location);
    assert.match(page.text, /Service Request cancelled successfully\./);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 18: Invalid Direct Transition Is Still Rejected
test("invalid direct transitions are rejected by T10 and change nothing", async () => {
  const setup = createInterfaceSetup();

  try {
    const pending = persist(setup);
    const completed = persist(setup, { status: "Completed" });
    const cancelled = persist(setup, { status: "Cancelled" });

    // Pending -> Completed, sent directly even though no Complete button is shown
    const response = await postAction(setup, pending.id, "complete");

    assert.equal(response.statusCode, 409);
    assert.match(response.text, /This action is not allowed for a Pending Service Request\./);
    assert.equal(setup.serviceRequestRepository.findById(pending.id).status, "Pending");

    // terminal states stay terminal
    for (const [terminal, actions] of [
      [completed, ["start-processing", "complete", "cancel"]],
      [cancelled, ["start-processing", "complete", "cancel"]]
    ]) {
      for (const action of actions) {
        const attempt = await postAction(setup, terminal.id, action);
        assert.equal(attempt.statusCode, 409, `${terminal.status} ${action}`);
      }
      assert.deepEqual(setup.serviceRequestRepository.findById(terminal.id), terminal);
    }
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 19: Completed and Cancelled Requests Remain Visible
test("Completed and Cancelled requests remain listed, searchable, filterable and viewable", async () => {
  const setup = createInterfaceSetup();

  try {
    const completed = persist(setup, { serviceType: "Barangay Clearance", status: "Completed" });
    const cancelled = persist(setup, { serviceType: "Community Assistance", description: "Food", status: "Cancelled" });

    const listing = await request(setup.app).get("/service-requests");
    assert.deepEqual(new Set(listedIds(listing.text)), new Set([completed.id, cancelled.id]));
    assert.match(listing.text, />Completed</);
    assert.match(listing.text, />Cancelled</);
    // no workflow action forms for terminal requests
    assert.doesNotMatch(listing.text, /action="\/service-requests\/\d+\/(start-processing|complete|cancel)"/);

    const search = await request(setup.app).get("/service-requests").query({ search: "assist" });
    assert.deepEqual(listedIds(search.text), [cancelled.id]);

    const filter = await request(setup.app).get("/service-requests").query({ status: "Completed" });
    assert.deepEqual(listedIds(filter.text), [completed.id]);

    for (const terminal of [completed, cancelled]) {
      const view = await request(setup.app).get(`/service-requests/${terminal.id}`);
      assert.equal(view.statusCode, 200);
      assert.match(view.text, new RegExp(`${terminal.status} is a final state`));
      assert.doesNotMatch(view.text, />(Start Processing|Complete|Cancel)</);
    }
  } finally {
    cleanupInterfaceSetup(setup);
  }
});

// Test 20: GET Requests Do Not Change Service Request State
test("GET requests never create or change Service Requests", async () => {
  const setup = createInterfaceSetup();

  try {
    const pending = persist(setup);
    const inProgress = persist(setup, { status: "In Progress" });
    const before = setup.serviceRequestRepository.findAll();

    await request(setup.app).get("/service-requests");
    await request(setup.app).get("/service-requests").query({ search: "clearance" });
    await request(setup.app).get("/service-requests").query({ status: "Pending" });
    await request(setup.app).get("/service-requests/new");
    await request(setup.app).get(`/service-requests/${pending.id}`);

    // workflow actions are not reachable through GET
    for (const action of ["start-processing", "complete", "cancel"]) {
      const response = await request(setup.app).get(`/service-requests/${inProgress.id}/${action}`);
      assert.equal(response.statusCode, 404, action);
    }

    assert.deepEqual(setup.serviceRequestRepository.findAll(), before);
  } finally {
    cleanupInterfaceSetup(setup);
  }
});
