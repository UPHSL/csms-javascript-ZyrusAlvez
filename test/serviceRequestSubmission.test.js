import test from "node:test";
import assert from "node:assert/strict";

import { DatabaseSync } from "node:sqlite";

import { ServiceRequest } from "../src/models/ServiceRequest.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { ServiceRequestValidator } from "../src/services/ServiceRequestValidator.js";
import { ServiceRequestSubmissionService } from "../src/services/ServiceRequestSubmissionService.js";

import { createTemporaryDatabasePath, removeDatabase, makeValidResident, saveResident } from "../src/utils/testUtils.js";

// both repositories share one temporary database file, like the real application
function createSubmissionSetup() {
  const databasePath = createTemporaryDatabasePath();

  const residentRepository = new ResidentRepository(databasePath);

  const serviceRequestRepository = new ServiceRequestRepository(databasePath);

  const validator = new ServiceRequestValidator();

  const service = new ServiceRequestSubmissionService(
    validator,
    serviceRequestRepository,
    residentRepository
  );

  return {
    databasePath,
    residentRepository,
    serviceRequestRepository,
    service
  };
}

function cleanupSubmissionSetup(
  databasePath,
  residentRepository,
  serviceRequestRepository
) {
  residentRepository.close();
  serviceRequestRepository.close();

  removeDatabase(
    databasePath
  );
}

// reads the count through a separate connection so the check hits the database file
function countServiceRequests(
  databasePath
) {
  const database =
    new DatabaseSync(databasePath);

  try {
    const row =
      database.prepare(
        "SELECT COUNT(*) AS count FROM service_requests"
      ).get();

    return Number(row.count);
  } finally {
    database.close();
  }
}

function makeValidServiceRequest(residentId, overrides = {}) {
  return new ServiceRequest({
    residentId,
    serviceType: "Barangay Clearance",
    description: "Requesting barangay clearance for employment requirements.",
    dateRequested: "2026-09-15",
    ...overrides
  });
}

// Test 1: Valid Service Request Submission Succeeds
test(
  "valid Service Request submission succeeds",
  () => {
    const {
      databasePath,
      residentRepository,
      serviceRequestRepository,
      service
    } = createSubmissionSetup();

    try {
      const resident =
        saveResident(
          residentRepository,
          makeValidResident()
        );

      const result =
        service.submitServiceRequest(
          makeValidServiceRequest(resident.id)
        );

      assert.equal(
        result.success,
        true
      );

      assert.ok(
        result.serviceRequest
      );

      assert.deepEqual(
        result.errors,
        []
      );

      assert.equal(
        result.residentNotFound,
        false
      );

      assert.equal(
        result.residentInactive,
        false
      );
    } finally {
      cleanupSubmissionSetup(
        databasePath,
        residentRepository,
        serviceRequestRepository
      );
    }
  }
);

// Test 2: Submitted Service Request Receives a Generated ID
test(
  "submitted Service Request receives a generated ID",
  () => {
    const {
      databasePath,
      residentRepository,
      serviceRequestRepository,
      service
    } = createSubmissionSetup();

    try {
      const resident =
        saveResident(
          residentRepository,
          makeValidResident()
        );

      const first =
        makeValidServiceRequest(resident.id);

      assert.equal(
        first.id,
        null
      );

      const firstResult =
        service.submitServiceRequest(first);

      const secondResult =
        service.submitServiceRequest(
          makeValidServiceRequest(resident.id)
        );

      assert.equal(
        typeof firstResult.serviceRequest.id,
        "number"
      );

      // each submission gets its own database-generated id
      assert.notEqual(
        secondResult.serviceRequest.id,
        firstResult.serviceRequest.id
      );
    } finally {
      cleanupSubmissionSetup(
        databasePath,
        residentRepository,
        serviceRequestRepository
      );
    }
  }
);

// Test 3: Submitted Service Request Is Persisted and Retrievable
test(
  "submitted Service Request is persisted and retrievable",
  () => {
    const {
      databasePath,
      residentRepository,
      serviceRequestRepository,
      service
    } = createSubmissionSetup();

    try {
      const resident =
        saveResident(
          residentRepository,
          makeValidResident()
        );

      const result =
        service.submitServiceRequest(
          makeValidServiceRequest(resident.id)
        );

      const stored =
        serviceRequestRepository.findById(
          result.serviceRequest.id
        );

      assert.ok(stored);

      assert.equal(
        stored.id,
        result.serviceRequest.id
      );

      assert.equal(
        countServiceRequests(databasePath),
        1
      );
    } finally {
      cleanupSubmissionSetup(
        databasePath,
        residentRepository,
        serviceRequestRepository
      );
    }
  }
);

// Test 4: Submitted Service Request Information Is Preserved
test(
  "submitted Service Request information is preserved",
  () => {
    const {
      databasePath,
      residentRepository,
      serviceRequestRepository,
      service
    } = createSubmissionSetup();

    try {
      const resident =
        saveResident(
          residentRepository,
          makeValidResident()
        );

      const result =
        service.submitServiceRequest(
          makeValidServiceRequest(resident.id)
        );

      const stored =
        serviceRequestRepository.findById(
          result.serviceRequest.id
        );

      assert.equal(
        stored.residentId,
        resident.id
      );

      assert.equal(
        stored.serviceType,
        "Barangay Clearance"
      );

      assert.equal(
        stored.description,
        "Requesting barangay clearance for employment requirements."
      );

      assert.equal(
        stored.dateRequested,
        "2026-09-15"
      );

      assert.equal(
        stored.status,
        "Pending"
      );
    } finally {
      cleanupSubmissionSetup(
        databasePath,
        residentRepository,
        serviceRequestRepository
      );
    }
  }
);

// Test 5: Submitted Service Request Status Is Pending
test(
  "submitted Service Request status is Pending",
  () => {
    const {
      databasePath,
      residentRepository,
      serviceRequestRepository,
      service
    } = createSubmissionSetup();

    try {
      const resident =
        saveResident(
          residentRepository,
          makeValidResident()
        );

      // status is not set; the T08 default applies
      const result =
        service.submitServiceRequest(
          makeValidServiceRequest(resident.id)
        );

      assert.equal(
        result.serviceRequest.status,
        "Pending"
      );

      assert.equal(
        serviceRequestRepository.findById(result.serviceRequest.id).status,
        "Pending"
      );
    } finally {
      cleanupSubmissionSetup(
        databasePath,
        residentRepository,
        serviceRequestRepository
      );
    }
  }
);

// Test 6: Blank Service Type Fails Validation
test(
  "blank service type fails validation",
  () => {
    const {
      databasePath,
      residentRepository,
      serviceRequestRepository,
      service
    } = createSubmissionSetup();

    try {
      const resident =
        saveResident(
          residentRepository,
          makeValidResident()
        );

      for (const serviceType of ["", "   "]) {
        const result =
          service.submitServiceRequest(
            makeValidServiceRequest(resident.id, { serviceType })
          );

        assert.equal(
          result.success,
          false
        );

        assert.equal(
          result.serviceRequest,
          null
        );

        assert.ok(
          result.errors.includes("serviceType")
        );
      }
    } finally {
      cleanupSubmissionSetup(
        databasePath,
        residentRepository,
        serviceRequestRepository
      );
    }
  }
);

// Test 7: Blank Description Fails Validation
test(
  "blank description fails validation",
  () => {
    const {
      databasePath,
      residentRepository,
      serviceRequestRepository,
      service
    } = createSubmissionSetup();

    try {
      const resident =
        saveResident(
          residentRepository,
          makeValidResident()
        );

      for (const description of ["", "   "]) {
        const result =
          service.submitServiceRequest(
            makeValidServiceRequest(resident.id, { description })
          );

        assert.equal(
          result.success,
          false
        );

        assert.ok(
          result.errors.includes("description")
        );
      }
    } finally {
      cleanupSubmissionSetup(
        databasePath,
        residentRepository,
        serviceRequestRepository
      );
    }
  }
);

// Test 8: Invalid Request Does Not Reach Persistence
// (also covers the required date validation: absent or invalid dates are never persisted)
test(
  "invalid Service Request does not reach persistence",
  () => {
    const {
      databasePath,
      residentRepository,
      serviceRequestRepository,
      service
    } = createSubmissionSetup();

    try {
      const resident =
        saveResident(
          residentRepository,
          makeValidResident()
        );

      const countBefore =
        countServiceRequests(databasePath);

      const invalidDates = [
        undefined,      // absent
        "",             // empty
        "2026-02-30",   // not a real calendar date
        "09/15/2026",   // not YYYY-MM-DD
        "2026-9-15"     // missing zero padding
      ];

      for (const dateRequested of invalidDates) {
        const result =
          service.submitServiceRequest(
            makeValidServiceRequest(resident.id, { dateRequested })
          );

        assert.equal(
          result.success,
          false
        );

        assert.ok(
          result.errors.includes("dateRequested")
        );
      }

      assert.equal(
        countServiceRequests(databasePath),
        countBefore
      );
    } finally {
      cleanupSubmissionSetup(
        databasePath,
        residentRepository,
        serviceRequestRepository
      );
    }
  }
);

// Test 9: Nonexistent Resident Prevents Submission
test(
  "nonexistent Resident prevents submission",
  () => {
    const {
      databasePath,
      residentRepository,
      serviceRequestRepository,
      service
    } = createSubmissionSetup();

    try {
      // structurally valid, but no such Resident is persisted
      const result =
        service.submitServiceRequest(
          makeValidServiceRequest(999999)
        );

      assert.equal(
        result.success,
        false
      );

      assert.equal(
        result.residentNotFound,
        true
      );

      assert.equal(
        result.residentInactive,
        false
      );

      assert.deepEqual(
        result.errors,
        []
      );

      assert.equal(
        countServiceRequests(databasePath),
        0
      );
    } finally {
      cleanupSubmissionSetup(
        databasePath,
        residentRepository,
        serviceRequestRepository
      );
    }
  }
);

// Test 10: Inactive Resident Cannot Submit a New Service Request
test(
  "Inactive Resident cannot submit a new Service Request",
  () => {
    const {
      databasePath,
      residentRepository,
      serviceRequestRepository,
      service
    } = createSubmissionSetup();

    try {
      const resident =
        saveResident(
          residentRepository,
          makeValidResident({ status: "Inactive" })
        );

      const result =
        service.submitServiceRequest(
          makeValidServiceRequest(resident.id)
        );

      assert.equal(
        result.success,
        false
      );

      assert.equal(
        result.residentInactive,
        true
      );

      assert.equal(
        result.residentNotFound,
        false
      );

      assert.equal(
        residentRepository.findById(resident.id).status,
        "Inactive"
      );

      assert.equal(
        countServiceRequests(databasePath),
        0
      );
    } finally {
      cleanupSubmissionSetup(
        databasePath,
        residentRepository,
        serviceRequestRepository
      );
    }
  }
);

// Test 11: Non-Pending Initial Status Is Rejected
test(
  "non-Pending initial status is rejected",
  () => {
    const {
      databasePath,
      residentRepository,
      serviceRequestRepository,
      service
    } = createSubmissionSetup();

    try {
      const resident =
        saveResident(
          residentRepository,
          makeValidResident()
        );

      for (const status of ["In Progress", "Completed", "Cancelled"]) {
        const result =
          service.submitServiceRequest(
            makeValidServiceRequest(resident.id, { status })
          );

        assert.equal(
          result.success,
          false
        );

        assert.ok(
          result.errors.includes("status")
        );
      }

      assert.equal(
        countServiceRequests(databasePath),
        0
      );
    } finally {
      cleanupSubmissionSetup(
        databasePath,
        residentRepository,
        serviceRequestRepository
      );
    }
  }
);

// Test 12: Service Request Persists Across Repository Access
test(
  "Service Request persists across repository access",
  () => {
    const {
      databasePath,
      residentRepository,
      serviceRequestRepository,
      service
    } = createSubmissionSetup();

    try {
      const resident =
        saveResident(
          residentRepository,
          makeValidResident()
        );

      const result =
        service.submitServiceRequest(
          makeValidServiceRequest(resident.id)
        );

      // a separate repository instance with its own connection
      const separateRepository =
        new ServiceRequestRepository(databasePath);

      try {
        const stored =
          separateRepository.findById(
            result.serviceRequest.id
          );

        assert.ok(stored);

        assert.deepEqual(
          { ...stored },
          { ...result.serviceRequest }
        );
      } finally {
        separateRepository.close();
      }
    } finally {
      cleanupSubmissionSetup(
        databasePath,
        residentRepository,
        serviceRequestRepository
      );
    }
  }
);

// Test 13: Submission Does Not Modify the Resident
test(
  "submission does not modify the Resident",
  () => {
    const {
      databasePath,
      residentRepository,
      serviceRequestRepository,
      service
    } = createSubmissionSetup();

    try {
      const resident =
        saveResident(
          residentRepository,
          makeValidResident()
        );

      const result =
        service.submitServiceRequest(
          makeValidServiceRequest(resident.id)
        );

      assert.equal(
        result.success,
        true
      );

      // id, names, address, contact number, email and status are all unchanged
      assert.deepEqual(
        { ...residentRepository.findById(resident.id) },
        { ...resident }
      );
    } finally {
      cleanupSubmissionSetup(
        databasePath,
        residentRepository,
        serviceRequestRepository
      );
    }
  }
);
