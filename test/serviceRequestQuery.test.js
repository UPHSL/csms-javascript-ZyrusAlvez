import test from "node:test";
import assert from "node:assert/strict";

import { DatabaseSync } from "node:sqlite";

import { ServiceRequest } from "../src/models/ServiceRequest.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import {
  ServiceRequestQueryService,
  UnsupportedStatusFilterError
} from "../src/services/ServiceRequestQueryService.js";

import { createTemporaryDatabasePath, removeDatabase, makeValidResident, saveResident } from "../src/utils/testUtils.js";

// both repositories share one temporary SQLite file, like the real application
function createQuerySetup() {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const serviceRequestRepository = new ServiceRequestRepository(databasePath);
  const resident = saveResident(residentRepository, makeValidResident());

  return {
    databasePath,
    residentRepository,
    serviceRequestRepository,
    resident,
    service: new ServiceRequestQueryService(serviceRequestRepository)
  };
}

function cleanupQuerySetup({ databasePath, residentRepository, serviceRequestRepository }) {
  residentRepository.close();
  serviceRequestRepository.close();
  removeDatabase(databasePath);
}

// persists a Service Request in the real service_requests table
function persist(setup, overrides = {}) {
  return setup.serviceRequestRepository.save(
    new ServiceRequest({
      residentId: setup.resident.id,
      serviceType: "Barangay Clearance",
      description: "Employment requirement",
      dateRequested: "2026-09-15",
      status: "Pending",
      ...overrides
    })
  );
}

// raw table contents read through a separate connection, to prove queries never write
function snapshotTable(databasePath) {
  const database = new DatabaseSync(databasePath);

  try {
    return database.prepare("SELECT * FROM service_requests ORDER BY id").all();
  } finally {
    database.close();
  }
}

const ids = (serviceRequests) => serviceRequests.map((serviceRequest) => serviceRequest.id);

// Test 1: List All Persisted Service Requests
test("listing returns every persisted Service Request", () => {
  const setup = createQuerySetup();

  try {
    const first = persist(setup, { serviceType: "Barangay Clearance" });
    const second = persist(setup, { serviceType: "Community Assistance" });
    const third = persist(setup, { serviceType: "Certificate of Residency" });

    const result = setup.service.listServiceRequests();

    assert.equal(result.length, 3);
    assert.deepEqual(
      new Set(ids(result)),
      new Set([first.id, second.id, third.id])
    );
    assert.ok(result.every((serviceRequest) => serviceRequest instanceof ServiceRequest));
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 2: Empty Listing Returns an Empty Collection
test("empty listing returns an empty array", () => {
  const setup = createQuerySetup();

  try {
    const result = setup.service.listServiceRequests();

    assert.ok(Array.isArray(result));
    assert.deepEqual(result, []);
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 3: Listing Uses Required Ordering (dateRequested DESC, then id DESC)
test("listing orders by dateRequested DESC, then id DESC", () => {
  const setup = createQuerySetup();

  try {
    // inserted deliberately out of the required order
    const oldest = persist(setup, { dateRequested: "2026-09-10" });
    const sameDateLower = persist(setup, { dateRequested: "2026-09-18" });
    const middle = persist(setup, { dateRequested: "2026-09-15" });
    const sameDateHigher = persist(setup, { dateRequested: "2026-09-18" });

    const result = setup.service.listServiceRequests();

    assert.deepEqual(ids(result), [
      sameDateHigher.id,
      sameDateLower.id,
      middle.id,
      oldest.id
    ]);
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 4: View Existing Service Request by ID
test("viewing an existing id returns that Service Request", () => {
  const setup = createQuerySetup();

  try {
    persist(setup, { serviceType: "Community Assistance" });
    const target = persist(setup, { serviceType: "Barangay Clearance" });

    const result = setup.service.viewServiceRequest(target.id);

    assert.ok(result instanceof ServiceRequest);
    assert.equal(result.id, target.id);
    assert.equal(result.serviceType, "Barangay Clearance");
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 5: Viewing an Unknown ID Is Handled Safely
test("viewing an unknown id returns null and creates nothing", () => {
  const setup = createQuerySetup();

  try {
    persist(setup);
    const before = snapshotTable(setup.databasePath);

    assert.equal(setup.service.viewServiceRequest(9999), null);
    assert.equal(setup.service.viewServiceRequest(0), null);
    assert.equal(setup.service.viewServiceRequest(-1), null);
    assert.equal(setup.service.viewServiceRequest(null), null);
    assert.equal(setup.service.viewServiceRequest(undefined), null);

    assert.deepEqual(snapshotTable(setup.databasePath), before);
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 6: Partial Service-Type Search Is Case-Insensitive
test("partial service-type search is case-insensitive", () => {
  const setup = createQuerySetup();

  try {
    const clearance = persist(setup, {
      serviceType: "Barangay Clearance",
      description: "Needed for school"
    });
    persist(setup, {
      serviceType: "Community Assistance",
      description: "Medical support"
    });

    for (const term of ["cLeAr", "clear", "CLEAR", "Clearance"]) {
      const result = setup.service.searchServiceRequests(term);
      assert.deepEqual(ids(result), [clearance.id], `term: ${term}`);
    }
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 7: Partial Description Search Is Case-Insensitive
test("partial description search is case-insensitive", () => {
  const setup = createQuerySetup();

  try {
    const employment = persist(setup, {
      serviceType: "Barangay Clearance",
      description: "Requesting barangay clearance for employment requirements."
    });
    persist(setup, {
      serviceType: "Community Assistance",
      description: "Medical support"
    });

    const result = setup.service.searchServiceRequests("EMPLOY");

    assert.deepEqual(ids(result), [employment.id]);
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 8: Blank Search Returns All Service Requests
test("blank search returns the same result as normal listing", () => {
  const setup = createQuerySetup();

  try {
    persist(setup, { dateRequested: "2026-09-10" });
    persist(setup, { dateRequested: "2026-09-18" });
    persist(setup, { dateRequested: "2026-09-18" });

    const listing = setup.service.listServiceRequests();

    for (const blank of ["", " ", "      ", "\t\n", null, undefined]) {
      assert.deepEqual(
        setup.service.searchServiceRequests(blank),
        listing,
        `blank: ${JSON.stringify(blank)}`
      );
    }
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 9: No Text Match Returns an Empty Collection
test("search with no match returns an empty array", () => {
  const setup = createQuerySetup();

  try {
    persist(setup, { serviceType: "Barangay Clearance", description: "Employment requirement" });

    const result = setup.service.searchServiceRequests("zzz-no-such-term");

    assert.ok(Array.isArray(result));
    assert.deepEqual(result, []);
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 10: Status Filter Returns Only Matching Status
test("status filter returns only Service Requests with that status", () => {
  const setup = createQuerySetup();

  try {
    const pendingA = persist(setup, { status: "Pending", dateRequested: "2026-09-10" });
    persist(setup, { status: "In Progress" });
    const pendingB = persist(setup, { status: "Pending", dateRequested: "2026-09-12" });
    persist(setup, { status: "Completed" });
    persist(setup, { status: "Cancelled" });

    const result = setup.service.searchServiceRequests("", "Pending");

    assert.deepEqual(ids(result), [pendingB.id, pendingA.id]);
    assert.ok(result.every((serviceRequest) => serviceRequest.status === "Pending"));

    // every supported status, including terminal ones, can be used as a filter
    for (const status of ["In Progress", "Completed", "Cancelled"]) {
      const filtered = setup.service.searchServiceRequests(undefined, status);
      assert.equal(filtered.length, 1, status);
      assert.equal(filtered[0].status, status);
    }
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 10b: Unsupported Status Filters Are Rejected
test("unsupported non-empty status filter is rejected", () => {
  const setup = createQuerySetup();

  try {
    persist(setup);

    for (const status of ["Approved", "Rejected", "Closed", "Done", "Processing", "pending"]) {
      assert.throws(
        () => setup.service.searchServiceRequests("clearance", status),
        UnsupportedStatusFilterError,
        status
      );
    }
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 11: Unfiltered Query Includes All Statuses
test("unfiltered listing includes all four lifecycle states", () => {
  const setup = createQuerySetup();

  try {
    for (const status of ["Pending", "In Progress", "Completed", "Cancelled"]) {
      persist(setup, { status });
    }

    const statuses = new Set(
      setup.service.listServiceRequests().map((serviceRequest) => serviceRequest.status)
    );
    const searchedStatuses = new Set(
      setup.service.searchServiceRequests("clearance").map((serviceRequest) => serviceRequest.status)
    );

    const expected = new Set(["Pending", "In Progress", "Completed", "Cancelled"]);
    assert.deepEqual(statuses, expected);
    assert.deepEqual(searchedStatuses, expected);
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 12: Combined Text Search and Status Filter
test("combined search returns only requests matching text AND status", () => {
  const setup = createQuerySetup();

  try {
    const both = persist(setup, {
      serviceType: "Barangay Clearance",
      description: "Employment requirement",
      status: "Pending"
    });
    persist(setup, { // text only
      serviceType: "Barangay Clearance",
      description: "Scholarship requirement",
      status: "Completed"
    });
    persist(setup, { // status only
      serviceType: "Community Assistance",
      description: "Employment support",
      status: "Pending"
    });
    persist(setup, { // neither
      serviceType: "Certificate of Residency",
      description: "Bank account opening",
      status: "Cancelled"
    });

    const result = setup.service.searchServiceRequests("  clearance  ", "Pending");

    assert.deepEqual(ids(result), [both.id]);
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 13: Matching Service Request Is Not Duplicated
test("a request matching both serviceType and description appears once", () => {
  const setup = createQuerySetup();

  try {
    const match = persist(setup, {
      serviceType: "Community Assistance",
      description: "Assistance requested for medical support"
    });

    const result = setup.service.searchServiceRequests("assistance");

    assert.deepEqual(ids(result), [match.id]);
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Test 14: Query Result Preserves Complete Service Request Information
test("list, view and search preserve every field and never modify persistence", () => {
  const setup = createQuerySetup();

  try {
    const saved = persist(setup, {
      serviceType: "Barangay Clearance",
      description: "Requesting barangay clearance for employment requirements.",
      dateRequested: "2026-09-18",
      status: "In Progress"
    });

    const expected = {
      id: saved.id,
      residentId: setup.resident.id,
      serviceType: "Barangay Clearance",
      description: "Requesting barangay clearance for employment requirements.",
      dateRequested: "2026-09-18",
      status: "In Progress"
    };

    const before = snapshotTable(setup.databasePath);

    const viewed = setup.service.viewServiceRequest(saved.id);
    const [listed] = setup.service.listServiceRequests();
    const [searched] = setup.service.searchServiceRequests("  EMPLOYMENT  ", "In Progress");

    for (const result of [viewed, listed, searched]) {
      assert.deepEqual({ ...result }, expected);
    }

    // read-only: the stored row is unchanged, including the untrimmed stored values
    assert.deepEqual(snapshotTable(setup.databasePath), before);
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Extra: search, filter and combined results all use the listing order
test("search and filter results use dateRequested DESC, then id DESC", () => {
  const setup = createQuerySetup();

  try {
    const older = persist(setup, { dateRequested: "2026-09-10" });
    const sameDateLower = persist(setup, { dateRequested: "2026-09-18" });
    const sameDateHigher = persist(setup, { dateRequested: "2026-09-18" });
    const expectedOrder = [sameDateHigher.id, sameDateLower.id, older.id];

    assert.deepEqual(ids(setup.service.searchServiceRequests("clear")), expectedOrder);
    assert.deepEqual(ids(setup.service.searchServiceRequests("", "Pending")), expectedOrder);
    assert.deepEqual(ids(setup.service.searchServiceRequests("clear", "Pending")), expectedOrder);
  } finally {
    cleanupQuerySetup(setup);
  }
});

// Extra: LIKE wildcards in the input are matched literally (parameterized + escaped)
test("search input wildcards and quotes are treated as literal text", () => {
  const setup = createQuerySetup();

  try {
    const percent = persist(setup, { description: "Fee waived 100% for seniors" });
    persist(setup, { description: "Regular processing" });

    assert.deepEqual(ids(setup.service.searchServiceRequests("%")), [percent.id]);
    assert.deepEqual(setup.service.searchServiceRequests("_"), []);
    assert.deepEqual(setup.service.searchServiceRequests("' OR 1=1 --"), []);
  } finally {
    cleanupQuerySetup(setup);
  }
});
