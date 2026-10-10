import test from "node:test";
import assert from "node:assert/strict";

import { DatabaseSync } from "node:sqlite";

import { ServiceRequest } from "../src/models/ServiceRequest.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { ServiceRequestValidator } from "../src/services/ServiceRequestValidator.js";
import { ServiceRequestSubmissionService } from "../src/services/ServiceRequestSubmissionService.js";
import { ServiceRequestStatusService } from "../src/services/ServiceRequestStatusService.js";
import { ResidentDeactivationService } from "../src/services/ResidentDeactivationService.js";

import { createTemporaryDatabasePath, removeDatabase, makeValidResident, saveResident } from "../src/utils/testUtils.js";

// both repositories share one temporary database file, like the real application
function createStatusSetup() {
  const databasePath = createTemporaryDatabasePath();

  const residentRepository = new ResidentRepository(databasePath);

  const serviceRequestRepository = new ServiceRequestRepository(databasePath);

  const submissionService = new ServiceRequestSubmissionService(
    new ServiceRequestValidator(),
    serviceRequestRepository,
    residentRepository
  );

  const service = new ServiceRequestStatusService(serviceRequestRepository);

  return {
    databasePath,
    residentRepository,
    serviceRequestRepository,
    submissionService,
    service
  };
}

function cleanupStatusSetup({
  databasePath,
  residentRepository,
  serviceRequestRepository
}) {
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

// creates a Pending Service Request through the normal T09 submission workflow
function submitPendingServiceRequest(setup, overrides = {}) {
  const resident =
    saveResident(
      setup.residentRepository,
      makeValidResident()
    );

  const result =
    setup.submissionService.submitServiceRequest(
      new ServiceRequest({
        residentId: resident.id,
        serviceType: "Barangay Clearance",
        description: "Employment requirement",
        dateRequested: "2026-09-15",
        ...overrides
      })
    );

  return result.serviceRequest;
}

// Test 1: Pending Can Move to In Progress
test(
  "Pending can move to In Progress",
  () => {
    const setup = createStatusSetup();

    try {
      const pending =
        submitPendingServiceRequest(setup);

      const result =
        setup.service.changeStatus(
          pending.id,
          "In Progress"
        );

      assert.equal(
        result.success,
        true
      );

      assert.equal(
        result.serviceRequest.status,
        "In Progress"
      );

      assert.equal(
        setup.serviceRequestRepository.findById(pending.id).status,
        "In Progress"
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);

// Test 2: Pending Can Move to Cancelled
test(
  "Pending can move to Cancelled",
  () => {
    const setup = createStatusSetup();

    try {
      const pending =
        submitPendingServiceRequest(setup);

      const result =
        setup.service.changeStatus(
          pending.id,
          "Cancelled"
        );

      assert.equal(
        result.success,
        true
      );

      assert.equal(
        setup.serviceRequestRepository.findById(pending.id).status,
        "Cancelled"
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);

// Test 3: In Progress Can Move to Completed
test(
  "In Progress can move to Completed",
  () => {
    const setup = createStatusSetup();

    try {
      const pending =
        submitPendingServiceRequest(setup);

      // reach In Progress through the T10 workflow, not by editing the row
      setup.service.changeStatus(
        pending.id,
        "In Progress"
      );

      const result =
        setup.service.changeStatus(
          pending.id,
          "Completed"
        );

      assert.equal(
        result.success,
        true
      );

      assert.equal(
        setup.serviceRequestRepository.findById(pending.id).status,
        "Completed"
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);

// Test 4: In Progress Can Move to Cancelled
test(
  "In Progress can move to Cancelled",
  () => {
    const setup = createStatusSetup();

    try {
      const pending =
        submitPendingServiceRequest(setup);

      setup.service.changeStatus(
        pending.id,
        "In Progress"
      );

      const result =
        setup.service.changeStatus(
          pending.id,
          "Cancelled"
        );

      assert.equal(
        result.success,
        true
      );

      assert.equal(
        setup.serviceRequestRepository.findById(pending.id).status,
        "Cancelled"
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);

// Test 5: Pending Cannot Move Directly to Completed
test(
  "Pending cannot move directly to Completed",
  () => {
    const setup = createStatusSetup();

    try {
      const pending =
        submitPendingServiceRequest(setup);

      const result =
        setup.service.changeStatus(
          pending.id,
          "Completed"
        );

      assert.equal(
        result.success,
        false
      );

      assert.equal(
        result.invalidTransition,
        true
      );

      assert.equal(
        setup.serviceRequestRepository.findById(pending.id).status,
        "Pending"
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);

// Test 6: In Progress Cannot Return to Pending
test(
  "In Progress cannot return to Pending",
  () => {
    const setup = createStatusSetup();

    try {
      const pending =
        submitPendingServiceRequest(setup);

      setup.service.changeStatus(
        pending.id,
        "In Progress"
      );

      const result =
        setup.service.changeStatus(
          pending.id,
          "Pending"
        );

      assert.equal(
        result.success,
        false
      );

      assert.equal(
        result.invalidTransition,
        true
      );

      assert.equal(
        setup.serviceRequestRepository.findById(pending.id).status,
        "In Progress"
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);

// Test 7: Completed Is Terminal
test(
  "Completed is terminal",
  () => {
    const setup = createStatusSetup();

    try {
      const pending =
        submitPendingServiceRequest(setup);

      setup.service.changeStatus(pending.id, "In Progress");
      setup.service.changeStatus(pending.id, "Completed");

      for (const requestedStatus of ["Pending", "In Progress", "Cancelled"]) {
        const result =
          setup.service.changeStatus(
            pending.id,
            requestedStatus
          );

        assert.equal(
          result.success,
          false
        );

        assert.equal(
          result.invalidTransition,
          true
        );
      }

      assert.equal(
        setup.serviceRequestRepository.findById(pending.id).status,
        "Completed"
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);

// Test 8: Cancelled Is Terminal
test(
  "Cancelled is terminal",
  () => {
    const setup = createStatusSetup();

    try {
      const pending =
        submitPendingServiceRequest(setup);

      setup.service.changeStatus(pending.id, "Cancelled");

      for (const requestedStatus of ["Pending", "In Progress", "Completed"]) {
        const result =
          setup.service.changeStatus(
            pending.id,
            requestedStatus
          );

        assert.equal(
          result.success,
          false
        );

        assert.equal(
          result.invalidTransition,
          true
        );
      }

      assert.equal(
        setup.serviceRequestRepository.findById(pending.id).status,
        "Cancelled"
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);

// Test 9: Unsupported Status Is Rejected
test(
  "unsupported status is rejected",
  () => {
    const setup = createStatusSetup();

    try {
      const pending =
        submitPendingServiceRequest(setup);

      const result =
        setup.service.changeStatus(
          pending.id,
          "Approved"
        );

      assert.equal(
        result.success,
        false
      );

      assert.equal(
        result.unsupportedStatus,
        true
      );

      assert.equal(
        result.invalidTransition,
        false
      );

      assert.equal(
        setup.serviceRequestRepository.findById(pending.id).status,
        "Pending"
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);

// Test 10: Nonexistent Service Request Is Handled Safely
test(
  "nonexistent Service Request is handled safely",
  () => {
    const setup = createStatusSetup();

    try {
      const existing =
        submitPendingServiceRequest(setup);

      const countBefore =
        countServiceRequests(setup.databasePath);

      const result =
        setup.service.changeStatus(
          999999,
          "In Progress"
        );

      assert.equal(
        result.success,
        false
      );

      assert.equal(
        result.notFound,
        true
      );

      assert.equal(
        result.serviceRequest,
        null
      );

      assert.equal(
        countServiceRequests(setup.databasePath),
        countBefore
      );

      assert.deepEqual(
        { ...setup.serviceRequestRepository.findById(existing.id) },
        { ...existing }
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);

// Test 11: Successful Transition Preserves Service Request Information
test(
  "successful transition preserves Service Request information",
  () => {
    const setup = createStatusSetup();

    try {
      const pending =
        submitPendingServiceRequest(setup);

      setup.service.changeStatus(
        pending.id,
        "In Progress"
      );

      const stored =
        setup.serviceRequestRepository.findById(pending.id);

      assert.equal(stored.id, pending.id);
      assert.equal(stored.residentId, pending.residentId);
      assert.equal(stored.serviceType, "Barangay Clearance");
      assert.equal(stored.description, "Employment requirement");
      assert.equal(stored.dateRequested, "2026-09-15");

      // only the status may differ
      assert.deepEqual(
        { ...stored, status: pending.status },
        { ...pending }
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);

// Test 12: Invalid Transition Does Not Modify Persistence
test(
  "invalid transition does not modify persistence",
  () => {
    const setup = createStatusSetup();

    try {
      const pending =
        submitPendingServiceRequest(setup);

      const result =
        setup.service.changeStatus(
          pending.id,
          "Completed"
        );

      assert.equal(
        result.success,
        false
      );

      assert.deepEqual(
        { ...setup.serviceRequestRepository.findById(pending.id) },
        { ...pending }
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);

// Test 13: Same-Status Request Is Rejected
test(
  "same-status request is rejected",
  () => {
    const setup = createStatusSetup();

    try {
      const pending =
        submitPendingServiceRequest(setup);

      const result =
        setup.service.changeStatus(
          pending.id,
          "Pending"
        );

      assert.equal(
        result.success,
        false
      );

      assert.equal(
        result.invalidTransition,
        true
      );

      assert.deepEqual(
        { ...setup.serviceRequestRepository.findById(pending.id) },
        { ...pending }
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);

// Student-Designed Test: T09 blocks new requests from Inactive Residents,
// but T10 must still let an existing request finish its workflow
test(
  "existing Service Request can still be processed after its Resident is deactivated",
  () => {
    const setup = createStatusSetup();

    try {
      const pending =
        submitPendingServiceRequest(setup);

      const deactivationService =
        new ResidentDeactivationService(setup.residentRepository);

      deactivationService.deactivateResident(pending.residentId);

      const startResult =
        setup.service.changeStatus(
          pending.id,
          "In Progress"
        );

      const completeResult =
        setup.service.changeStatus(
          pending.id,
          "Completed"
        );

      assert.equal(
        startResult.success,
        true
      );

      assert.equal(
        completeResult.success,
        true
      );

      assert.equal(
        setup.serviceRequestRepository.findById(pending.id).status,
        "Completed"
      );

      // processing the request does not touch the Resident
      assert.equal(
        setup.residentRepository.findById(pending.residentId).status,
        "Inactive"
      );
    } finally {
      cleanupStatusSetup(setup);
    }
  }
);
