import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { DatabaseSync } from "node:sqlite";

import { Resident } from "../src/models/Resident.js";
import { ResidentValidator } from "../src/services/ResidentValidator.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ResidentRegistrationService } from "../src/services/ResidentRegistrationService.js";

import { makeValidResident, makeResidentWithMissingFirstName, createTemporaryDatabasePath, removeDatabase } from "../src/utils/testUtils.js";

// Moved the createTemporaryDatabasePath and removeDatabase functions to src/utils/testUtils.js
// since they are being used in multiple test files. This is to avoid code duplication and promote reusability.
 
// for Step 20 - Add a Valid Resident Helper
// I won't copy it here since it is already in src/utils/testUtils.js so I will just import it from there
 
function createRegistrationSetup() {
  const databasePath =
    createTemporaryDatabasePath();

  const repository =
    new ResidentRepository(databasePath);

  const validator =
    new ResidentValidator();

  const service =
    new ResidentRegistrationService(
      validator,
      repository
    );

  return {
    databasePath,
    repository,
    validator,
    service
  };
}

function countResidents(
  databasePath
) {
  const database =
    new DatabaseSync(databasePath);

  try {
    const statement =
      database.prepare(
        "SELECT COUNT(*) AS count FROM residents"
      );

    const row =
      statement.get();

    return Number(row.count);
  } finally {
    database.close();
  }
}

// Test 1: Register a Valid Resident
test(
  "registers a valid Resident",
  () => {
    const {
      databasePath,
      service
    } = createRegistrationSetup();

    try {
      const resident =
        makeValidResident();

      const result =
        service.registerResident(resident);

      assert.equal(
        result.success,
        true
      );

      assert.ok(
        result.resident
      );

      assert.deepEqual(
        result.errors,
        []
      );
    } finally {
      removeDatabase(databasePath);
    }
  }
);

// Test 2: Registered Resident Receives an ID
test(
  "registered Resident receives an identifier",
  () => {
    const {
      databasePath,
      service
    } = createRegistrationSetup();

    try {
      const resident =
        makeValidResident();

      assert.equal(
        resident.id,
        null
      );

      const result =
        service.registerResident(resident);

      assert.equal(
        result.success,
        true
      );

      assert.ok(
        result.resident
      );

      assert.notEqual(
        result.resident.id,
        null
      );

      assert.notEqual(
        result.resident.id,
        undefined
      );
    } finally {
      removeDatabase(databasePath);
    }
  }
);

// Test 3: Registered Resident Is Actually Persisted
test(
  "registered Resident is persisted",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createRegistrationSetup();

    try {
      const resident =
        makeValidResident();

      const result =
        service.registerResident(resident);

      assert.equal(
        result.success,
        true
      );

      assert.ok(
        result.resident
      );

      const storedResident =
        repository.findById(
          result.resident.id
        );

      assert.ok(
        storedResident
      );

      assert.equal(
        storedResident.id,
        result.resident.id
      );
    } finally {
      removeDatabase(databasePath);
    }
  }
);

// Test 4: Verify All Resident Information
test(
  "registered Resident information is preserved",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createRegistrationSetup();

    try {
      const resident =
        makeValidResident();

      const result =
        service.registerResident(resident);

      const storedResident =
        repository.findById(
          result.resident.id
        );

      assert.ok(storedResident);

      assert.equal(
        storedResident.firstName,
        "Juan"
      );

      assert.equal(
        storedResident.lastName,
        "Dela Cruz"
      );

      assert.equal(
        storedResident.address,
        "Barangay Santo Tomas"
      );

      assert.equal(
        storedResident.contactNumber,
        "09171234567"
      );

      assert.equal(
        storedResident.email,
        "juan@example.com"
      );

      assert.equal(
        storedResident.status,
        "Active"
      );
    } finally {
      removeDatabase(databasePath);
    }
  }
);

// Test 5: Preserve Default Active Status
test(
  "registration preserves the default Active status",
  () => {
    const {
      databasePath,
      service
    } = createRegistrationSetup();

    try {
      const resident =
        makeValidResident();

      assert.equal(
        resident.status,
        "Active"
      );

      const result =
        service.registerResident(resident);

      assert.equal(
        result.success,
        true
      );

      assert.equal(
        result.resident.status,
        "Active"
      );
    } finally {
      removeDatabase(databasePath);
    }
  }
);

// Test 6: Invalid Registration Must Fail
test(
  "invalid Resident registration fails",
  () => {
    const {
      databasePath,
      service
    } = createRegistrationSetup();

    try {
      const resident =
        makeResidentWithMissingFirstName();

      const result =
        service.registerResident(resident);

      assert.equal(
        result.success,
        false
      );

      assert.equal(
        result.resident,
        null
      );

      assert.ok(
        result.errors.length > 0
      );
    } finally {
      removeDatabase(databasePath);
    }
  }
);

// Test 7: Invalid Resident Must Not Be Persisted
test(
  "invalid Resident is not persisted",
  () => {
    const {
      databasePath,
      service
    } = createRegistrationSetup();

    try {
      const resident =
        makeResidentWithMissingFirstName();

      const countBefore =
        countResidents(databasePath);

      const result =
        service.registerResident(resident);

      const countAfter =
        countResidents(databasePath);

      assert.equal(
        result.success,
        false
      );

      assert.equal(
        countAfter,
        countBefore
      );
    } finally {
      removeDatabase(databasePath);
    }
  }
);

// Test 8: Verify the Validation Error

test(
  "registration identifies the validation failure",
  () => {
    const {
      databasePath,
      service
    } = createRegistrationSetup();

    try {
      const resident =
        makeResidentWithMissingFirstName();

      const result =
        service.registerResident(resident);

      assert.equal(
        result.success,
        false
      );

      assert.ok(
        result.errors.includes(
          "firstName"
        )
      );
    } finally {
      removeDatabase(databasePath);
    }
  }
);