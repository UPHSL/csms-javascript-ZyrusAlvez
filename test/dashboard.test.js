import test from "node:test";
import assert from "node:assert/strict";

import request from "supertest";

import { createApp } from "../src/app.js";
import { ServiceRequest } from "../src/models/ServiceRequest.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { DashboardService } from "../src/services/DashboardService.js";
import { ResidentDeactivationService } from "../src/services/ResidentDeactivationService.js";
import { ServiceRequestStatusService } from "../src/services/ServiceRequestStatusService.js";
import { createTemporaryDatabasePath, removeDatabase, makeResident, saveResident } from "../src/utils/testUtils.js";

// the real application on a temporary SQLite file shared by both repositories
function createDashboardSetup() {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const serviceRequestRepository = new ServiceRequestRepository(databasePath);

  return {
    databasePath,
    residentRepository,
    serviceRequestRepository,
    app: createApp({ residentRepository, serviceRequestRepository }),
    dashboardService: new DashboardService(residentRepository, serviceRequestRepository),
    deactivationService: new ResidentDeactivationService(residentRepository),
    statusService: new ServiceRequestStatusService(serviceRequestRepository)
  };
}

function cleanupDashboardSetup({ databasePath, residentRepository, serviceRequestRepository }) {
  residentRepository.close();
  serviceRequestRepository.close();
  removeDatabase(databasePath);
}

let residentSequence = 0;

function persistResident(setup, status = "Active") {
  residentSequence += 1;
  const suffix = String(residentSequence).padStart(9, "0");

  return saveResident(
    setup.residentRepository,
    makeResident(`First${residentSequence}`, `Last${residentSequence}`, `09${suffix}`, `r${residentSequence}@example.com`, status)
  );
}

function persistServiceRequest(setup, overrides = {}) {
  return setup.serviceRequestRepository.save(
    new ServiceRequest({
      residentId: 1,
      serviceType: "Barangay Clearance",
      description: "Employment requirement",
      dateRequested: "2026-09-15",
      status: "Pending",
      ...overrides
    })
  );
}

// reads the rendered metric values, e.g. { "residents-total": 3, ... }
async function getDashboardMetrics(setup) {
  const response = await request(setup.app).get("/dashboard");
  assert.equal(response.statusCode, 200);

  const metrics = Object.fromEntries(
    [...response.text.matchAll(/data-metric="([a-z-]+)">(\d+)</g)].map((match) => [match[1], Number(match[2])])
  );

  return { response, metrics };
}

// ids of the recent Service Request rows, in page order
function recentIds(html) {
  return [...html.matchAll(/data-service-request-id="(\d+)"/g)].map((match) => Number(match[1]));
}

// the complete persisted state of both tables
function snapshot(setup) {
  return {
    residents: setup.residentRepository.findAll(),
    serviceRequests: setup.serviceRequestRepository.findAll()
  };
}

const ALL_METRICS = [
  "residents-total",
  "residents-active",
  "residents-inactive",
  "service-requests-total",
  "service-requests-open",
  "service-requests-pending",
  "service-requests-in-progress",
  "service-requests-completed",
  "service-requests-cancelled"
];

// Test 1: Dashboard Loads Successfully
test("dashboard loads with all sections and navigation", async () => {
  const setup = createDashboardSetup();

  try {
    const { response } = await getDashboardMetrics(setup);

    assert.match(response.headers["content-type"], /text\/html/);
    assert.match(response.text, /<h1[^>]*>CSMS Dashboard<\/h1>/);
    assert.match(response.text, />Residents<\/h2>/);
    assert.match(response.text, />Service Requests<\/h2>/);
    assert.match(response.text, />Recent Service Requests<\/h2>/);
    assert.match(response.text, /Open \(Pending \+ In Progress\)/);

    // navigation to the major modules
    assert.match(response.text, /href="\/dashboard"[^>]*>Dashboard</);
    assert.match(response.text, /href="\/residents"[^>]*>Residents</);
    assert.match(response.text, /href="\/service-requests"[^>]*>Service Requests</);
    assert.match(response.text, /href="\/residents"[^>]*>Resident Management</);
    assert.match(response.text, /href="\/service-requests"[^>]*>Service Request Management</);
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Test 2: Empty Dashboard Displays Zero Counts
test("empty dashboard shows zero for every count and a safe empty state", async () => {
  const setup = createDashboardSetup();

  try {
    const { response, metrics } = await getDashboardMetrics(setup);

    assert.deepEqual(Object.keys(metrics).sort(), [...ALL_METRICS].sort());
    for (const metric of ALL_METRICS) {
      assert.equal(metrics[metric], 0, metric);
    }

    assert.match(response.text, /No Service Requests available\./);
    assert.deepEqual(recentIds(response.text), []);
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Test 3: Total Resident Count Is Correct
test("total Resident count includes every persisted Resident", async () => {
  const setup = createDashboardSetup();

  try {
    persistResident(setup);
    persistResident(setup);
    persistResident(setup, "Inactive");

    const { metrics } = await getDashboardMetrics(setup);

    assert.equal(metrics["residents-total"], 3);
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Test 4: Resident Status Counts Are Correct
test("Active and Inactive Resident counts are correct and reconcile", async () => {
  const setup = createDashboardSetup();

  try {
    for (let index = 0; index < 4; index += 1) persistResident(setup, "Active");
    for (let index = 0; index < 2; index += 1) persistResident(setup, "Inactive");

    const { metrics } = await getDashboardMetrics(setup);

    assert.equal(metrics["residents-active"], 4);
    assert.equal(metrics["residents-inactive"], 2);
    assert.equal(metrics["residents-total"], metrics["residents-active"] + metrics["residents-inactive"]);
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Test 5: Total Service Request Count Is Correct
test("total Service Request count includes every status", async () => {
  const setup = createDashboardSetup();

  try {
    persistServiceRequest(setup, { status: "Pending" });
    persistServiceRequest(setup, { status: "Completed" });
    persistServiceRequest(setup, { status: "Cancelled" });

    const { metrics } = await getDashboardMetrics(setup);

    assert.equal(metrics["service-requests-total"], 3);
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Tests 6, 7 and 8 share one data set
function persistMixedStatuses(setup) {
  const counts = { "Pending": 3, "In Progress": 2, "Completed": 4, "Cancelled": 1 };

  for (const [status, count] of Object.entries(counts)) {
    for (let index = 0; index < count; index += 1) {
      persistServiceRequest(setup, { status });
    }
  }
}

// Test 6: Service Request Status Counts Are Correct
test("Service Request status counts are correct", async () => {
  const setup = createDashboardSetup();

  try {
    persistMixedStatuses(setup);

    const { metrics } = await getDashboardMetrics(setup);

    assert.equal(metrics["service-requests-pending"], 3);
    assert.equal(metrics["service-requests-in-progress"], 2);
    assert.equal(metrics["service-requests-completed"], 4);
    assert.equal(metrics["service-requests-cancelled"], 1);
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Test 7: Service Request Counts Reconcile
test("Service Request total equals the sum of the four statuses", async () => {
  const setup = createDashboardSetup();

  try {
    persistMixedStatuses(setup);

    const { metrics } = await getDashboardMetrics(setup);

    assert.equal(metrics["service-requests-total"], 10);
    assert.equal(
      metrics["service-requests-total"],
      metrics["service-requests-pending"] +
        metrics["service-requests-in-progress"] +
        metrics["service-requests-completed"] +
        metrics["service-requests-cancelled"]
    );
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Test 8: Open Request Count Is Correct
test("Open equals Pending plus In Progress and excludes terminal requests", async () => {
  const setup = createDashboardSetup();

  try {
    persistMixedStatuses(setup);

    const { metrics } = await getDashboardMetrics(setup);

    assert.equal(metrics["service-requests-open"], 5);
    assert.equal(
      metrics["service-requests-open"],
      metrics["service-requests-pending"] + metrics["service-requests-in-progress"]
    );

    // Open is derived, never stored as a status
    assert.deepEqual(
      Object.keys(setup.serviceRequestRepository.countByStatus()).sort(),
      ["Cancelled", "Completed", "In Progress", "Pending"]
    );
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Test 9: Resident Deactivation Is Reflected
test("Resident deactivation is reflected after refresh", async () => {
  const setup = createDashboardSetup();

  try {
    const resident = persistResident(setup, "Active");
    persistResident(setup, "Active");
    persistResident(setup, "Inactive");

    const { metrics: before } = await getDashboardMetrics(setup);

    // the existing T07 business capability performs the change
    setup.deactivationService.deactivateResident(resident.id);

    const { metrics: after } = await getDashboardMetrics(setup);

    assert.equal(after["residents-total"], before["residents-total"]);
    assert.equal(after["residents-active"], before["residents-active"] - 1);
    assert.equal(after["residents-inactive"], before["residents-inactive"] + 1);
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Test 10: Service Request Transition Is Reflected
test("Pending to In Progress is reflected after refresh", async () => {
  const setup = createDashboardSetup();

  try {
    const pending = persistServiceRequest(setup);
    persistServiceRequest(setup);
    persistServiceRequest(setup, { status: "Completed" });

    const { metrics: before } = await getDashboardMetrics(setup);

    // the existing T10 workflow performs the change
    assert.equal(setup.statusService.changeStatus(pending.id, "In Progress").success, true);

    const { metrics: after } = await getDashboardMetrics(setup);

    assert.equal(after["service-requests-pending"], before["service-requests-pending"] - 1);
    assert.equal(after["service-requests-in-progress"], before["service-requests-in-progress"] + 1);
    assert.equal(after["service-requests-open"], before["service-requests-open"]);
    assert.equal(after["service-requests-total"], before["service-requests-total"]);
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Test 11: Terminal Transition Updates Open Count
test("completing or cancelling an In Progress request lowers Open, not Total", async () => {
  const setup = createDashboardSetup();

  try {
    const first = persistServiceRequest(setup);
    const second = persistServiceRequest(setup);
    setup.statusService.changeStatus(first.id, "In Progress");
    setup.statusService.changeStatus(second.id, "In Progress");

    const { metrics: before } = await getDashboardMetrics(setup);

    setup.statusService.changeStatus(first.id, "Completed");
    const { metrics: afterComplete } = await getDashboardMetrics(setup);

    assert.equal(afterComplete["service-requests-in-progress"], before["service-requests-in-progress"] - 1);
    assert.equal(afterComplete["service-requests-completed"], before["service-requests-completed"] + 1);
    assert.equal(afterComplete["service-requests-open"], before["service-requests-open"] - 1);
    assert.equal(afterComplete["service-requests-total"], before["service-requests-total"]);

    setup.statusService.changeStatus(second.id, "Cancelled");
    const { metrics: afterCancel } = await getDashboardMetrics(setup);

    assert.equal(afterCancel["service-requests-cancelled"], before["service-requests-cancelled"] + 1);
    assert.equal(afterCancel["service-requests-open"], before["service-requests-open"] - 2);
    assert.equal(afterCancel["service-requests-total"], before["service-requests-total"]);
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Test 12: Recent Requests Return No More Than Five
test("recent Service Requests show at most five", async () => {
  const setup = createDashboardSetup();

  try {
    for (let day = 1; day <= 8; day += 1) {
      persistServiceRequest(setup, { dateRequested: `2026-09-${String(day).padStart(2, "0")}` });
    }

    const { response } = await getDashboardMetrics(setup);
    assert.equal(recentIds(response.text).length, 5);
    assert.equal(setup.dashboardService.getSummary().recentServiceRequests.length, 5);

    // fewer than five: all are shown
    const small = createDashboardSetup();
    try {
      persistServiceRequest(small);
      persistServiceRequest(small);
      const { response: smallResponse } = await getDashboardMetrics(small);
      assert.equal(recentIds(smallResponse.text).length, 2);
    } finally {
      cleanupDashboardSetup(small);
    }
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Test 13: Recent Requests Use Correct Ordering
test("recent Service Requests use dateRequested DESC, then id DESC", async () => {
  const setup = createDashboardSetup();

  try {
    // inserted out of order, with shared dates
    const a = persistServiceRequest(setup, { dateRequested: "2026-09-10" });
    const b = persistServiceRequest(setup, { dateRequested: "2026-09-18" });
    const c = persistServiceRequest(setup, { dateRequested: "2026-09-05" });
    const d = persistServiceRequest(setup, { dateRequested: "2026-09-18" });
    const e = persistServiceRequest(setup, { dateRequested: "2026-09-12" });
    const f = persistServiceRequest(setup, { dateRequested: "2026-09-10" });
    persistServiceRequest(setup, { dateRequested: "2026-09-01" });

    const { response } = await getDashboardMetrics(setup);

    assert.deepEqual(recentIds(response.text), [d.id, b.id, e.id, f.id, a.id]);
    assert.ok(!recentIds(response.text).includes(c.id));

    // same order as the T11 listing, truncated to five
    const listingOrder = setup.serviceRequestRepository.findAll().slice(0, 5).map((serviceRequest) => serviceRequest.id);
    assert.deepEqual(recentIds(response.text), listingOrder);

    // each row links to the existing T13 details page
    for (const id of recentIds(response.text)) {
      assert.match(response.text, new RegExp(`href="/service-requests/${id}"[^>]*>View<`));
    }
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Test 14: Terminal Requests May Appear in Recent Results
test("recent Completed and Cancelled requests are not hidden", async () => {
  const setup = createDashboardSetup();

  try {
    persistServiceRequest(setup, { dateRequested: "2026-09-01" });
    const completed = persistServiceRequest(setup, { dateRequested: "2026-09-20", status: "Completed" });
    const cancelled = persistServiceRequest(setup, { dateRequested: "2026-09-19", status: "Cancelled" });

    const { response } = await getDashboardMetrics(setup);

    assert.deepEqual(recentIds(response.text).slice(0, 2), [completed.id, cancelled.id]);
    assert.match(response.text, />Completed</);
    assert.match(response.text, />Cancelled</);
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Test 15: Dashboard GET Does Not Modify Persistence
test("viewing the dashboard never modifies persisted data", async () => {
  const setup = createDashboardSetup();

  try {
    persistResident(setup, "Active");
    persistResident(setup, "Inactive");
    persistServiceRequest(setup, { status: "Pending" });
    persistServiceRequest(setup, { status: "In Progress" });
    persistServiceRequest(setup, { status: "Completed" });

    const before = snapshot(setup);

    for (let refresh = 0; refresh < 3; refresh += 1) {
      await getDashboardMetrics(setup);
    }

    assert.deepEqual(snapshot(setup), before);

    // no state-changing route exists on the dashboard
    const post = await request(setup.app).post("/dashboard");
    assert.equal(post.statusCode, 404);
    assert.deepEqual(snapshot(setup), before);
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Aggregate query verification: the counts come from SQL aggregates,
// so the dashboard works even if loading whole tables is forbidden
test("dashboard counts do not load whole tables", () => {
  const setup = createDashboardSetup();

  try {
    persistResident(setup, "Active");
    persistResident(setup, "Inactive");
    persistServiceRequest(setup, { status: "Pending" });
    persistServiceRequest(setup, { status: "Completed" });

    const forbidden = () => {
      throw new Error("findAll() must not be used to compute dashboard counts");
    };
    setup.residentRepository.findAll = forbidden;
    setup.serviceRequestRepository.findAll = forbidden;
    setup.serviceRequestRepository.search = forbidden;

    const summary = setup.dashboardService.getSummary();

    assert.deepEqual(summary.residents, { total: 2, active: 1, inactive: 1 });
    assert.deepEqual(summary.serviceRequests, {
      total: 2,
      pending: 1,
      inProgress: 0,
      completed: 1,
      cancelled: 0,
      open: 1
    });
    assert.equal(summary.recentServiceRequests.length, 2);
  } finally {
    cleanupDashboardSetup(setup);
  }
});

// Repository-level aggregates
test("repository aggregates count by status in SQL", () => {
  const setup = createDashboardSetup();

  try {
    assert.equal(setup.residentRepository.countAll(), 0);
    assert.deepEqual(setup.residentRepository.countByStatus(), {});
    assert.equal(setup.serviceRequestRepository.countAll(), 0);
    assert.deepEqual(setup.serviceRequestRepository.countByStatus(), {});
    assert.deepEqual(setup.serviceRequestRepository.findRecent(5), []);

    persistResident(setup, "Active");
    persistResident(setup, "Active");
    persistResident(setup, "Inactive");
    persistServiceRequest(setup, { status: "In Progress" });

    assert.equal(setup.residentRepository.countAll(), 3);
    assert.deepEqual(setup.residentRepository.countByStatus(), { Active: 2, Inactive: 1 });
    assert.equal(setup.serviceRequestRepository.countAll(), 1);
    assert.deepEqual(setup.serviceRequestRepository.countByStatus(), { "In Progress": 1 });
  } finally {
    cleanupDashboardSetup(setup);
  }
});
