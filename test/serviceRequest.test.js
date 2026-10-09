import test from "node:test";
import assert from "node:assert/strict";

import { ServiceRequest } from "../src/models/ServiceRequest.js";

function makeServiceRequest(overrides = {}) {
  return new ServiceRequest({
    residentId: 25,
    serviceType: "Barangay Clearance",
    description: "Request for employment requirement",
    dateRequested: "2026-10-09",
    ...overrides
  });
}

// Test 1: Service Request Can Be Created
test(
  "Service Request can be created",
  () => {
    const serviceRequest =
      makeServiceRequest();

    assert.ok(
      serviceRequest instanceof ServiceRequest
    );
  }
);

// Test 2: Service Request Information Is Accessible
test(
  "Service Request information is accessible",
  () => {
    const serviceRequest =
      makeServiceRequest();

    assert.equal(
      serviceRequest.residentId,
      25
    );

    assert.equal(
      serviceRequest.serviceType,
      "Barangay Clearance"
    );

    assert.equal(
      serviceRequest.description,
      "Request for employment requirement"
    );

    assert.equal(
      serviceRequest.dateRequested,
      "2026-10-09"
    );
  }
);

// Test 3: Resident ID Is Preserved
test(
  "Service Request preserves the Resident ID",
  () => {
    const serviceRequest =
      makeServiceRequest({ residentId: 25 });

    assert.equal(
      serviceRequest.residentId,
      25
    );
  }
);

// Test 4: New Service Request Has an Unassigned ID
test(
  "new Service Request has an unassigned ID",
  () => {
    const serviceRequest =
      makeServiceRequest();

    assert.equal(
      serviceRequest.id,
      null
    );
  }
);

// Test 5: New Service Request Defaults to Pending
test(
  "new Service Request defaults to Pending",
  () => {
    // no status is supplied
    const serviceRequest =
      makeServiceRequest();

    assert.equal(
      serviceRequest.status,
      "Pending"
    );
  }
);

// Test 6: Service Request Information Is Independent Between Objects
test(
  "Service Request information is independent between objects",
  () => {
    const first =
      makeServiceRequest();

    const second =
      makeServiceRequest({
        residentId: 30,
        serviceType: "Permit Request",
        description: "Request for a business permit",
        dateRequested: "2026-10-10"
      });

    assert.equal(first.residentId, 25);
    assert.equal(first.serviceType, "Barangay Clearance");
    assert.equal(first.description, "Request for employment requirement");
    assert.equal(first.dateRequested, "2026-10-09");

    assert.equal(second.residentId, 30);
    assert.equal(second.serviceType, "Permit Request");
    assert.equal(second.description, "Request for a business permit");
    assert.equal(second.dateRequested, "2026-10-10");

    // changing one object must not affect the other
    second.description = "Changed description";

    assert.equal(
      first.description,
      "Request for employment requirement"
    );
  }
);
