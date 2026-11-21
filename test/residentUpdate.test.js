import test from "node:test";
import assert from "node:assert/strict";

import { DatabaseSync } from "node:sqlite";

import { ResidentValidator } from "../src/services/ResidentValidator.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ResidentQueryService } from "../src/services/ResidentQueryService.js";
import { ResidentUpdateService } from "../src/services/ResidentUpdateService.js";

import { createTemporaryDatabasePath, removeDatabase, makeValidResident, makeResident, saveResident } from "../src/utils/testUtils.js";

function createUpdateSetup() {
  const databasePath = createTemporaryDatabasePath();

  const repository = new ResidentRepository(databasePath);

  const validator = new ResidentValidator();

  const service = new ResidentUpdateService(validator, repository);

  const queryService = new ResidentQueryService(repository);

  return {
    databasePath,
    repository,
    service,
    queryService
  };
}

function cleanupUpdateSetup(
  databasePath,
  repository
) {
  if (repository && typeof repository.close === "function") {
    repository.close();
  }

  removeDatabase(
    databasePath
  );
}

// reads the count through a separate connection so the check hits the database file
function countResidents(
  databasePath
) {
  const database =
    new DatabaseSync(databasePath);

  try {
    const row =
      database.prepare(
        "SELECT COUNT(*) AS count FROM residents"
      ).get();

    return Number(row.count);
  } finally {
    database.close();
  }
}

function makeValidUpdate(overrides = {}) {
  return {
    firstName: "Juan Miguel",
    lastName: "Santos",
    address: "Barangay San Antonio",
    contactNumber: "09181234567",
    email: "juan.miguel@example.com",
    ...overrides
  };
}

// Test 1: Valid Resident Update Succeeds
test(
  "valid Resident update succeeds",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createUpdateSetup();

    try {
      const saved =
        saveResident(
          repository,
          makeValidResident()
        );

      const result =
        service.updateResident(
          saved.id,
          makeValidUpdate()
        );

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

      assert.equal(
        result.notFound,
        false
      );
    } finally {
      cleanupUpdateSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 2: Resident ID Is Preserved
test(
  "update preserves the Resident ID",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createUpdateSetup();

    try {
      const saved =
        saveResident(
          repository,
          makeValidResident()
        );

      const originalId =
        saved.id;

      const countBefore =
        countResidents(databasePath);

      const result =
        service.updateResident(
          originalId,
          makeValidUpdate()
        );

      assert.equal(
        result.success,
        true
      );

      assert.equal(
        result.resident.id,
        originalId
      );

      assert.equal(
        countResidents(databasePath),
        countBefore
      );
    } finally {
      cleanupUpdateSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 3: Permitted Resident Information Is Persisted
test(
  "update persists all permitted Resident information",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createUpdateSetup();

    try {
      const saved =
        saveResident(
          repository,
          makeValidResident()
        );

      const result =
        service.updateResident(
          saved.id,
          makeValidUpdate()
        );

      assert.equal(
        result.success,
        true
      );

      // a fresh repository proves the change reached the database file
      const freshRepository =
        new ResidentRepository(databasePath);

      try {
        const stored =
          freshRepository.findById(saved.id);

        assert.ok(stored);

        assert.equal(
          stored.firstName,
          "Juan Miguel"
        );

        assert.equal(
          stored.lastName,
          "Santos"
        );

        assert.equal(
          stored.address,
          "Barangay San Antonio"
        );

        assert.equal(
          stored.contactNumber,
          "09181234567"
        );

        assert.equal(
          stored.email,
          "juan.miguel@example.com"
        );
      } finally {
        freshRepository.close();
      }
    } finally {
      cleanupUpdateSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 4: Resident Status Is Preserved
test(
  "update preserves Active and Inactive status",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createUpdateSetup();

    try {
      const active =
        saveResident(
          repository,
          makeValidResident({ status: "Active" })
        );

      const inactive =
        saveResident(
          repository,
          makeValidResident({
            status: "Inactive",
            email: "inactive@example.com"
          })
        );

      // a status in the proposed data must be ignored
      const activeResult =
        service.updateResident(
          active.id,
          makeValidUpdate({ status: "Inactive" })
        );

      const inactiveResult =
        service.updateResident(
          inactive.id,
          makeValidUpdate({ status: "Active" })
        );

      assert.equal(
        activeResult.success,
        true
      );

      assert.equal(
        inactiveResult.success,
        true
      );

      assert.equal(
        repository.findById(active.id).status,
        "Active"
      );

      assert.equal(
        repository.findById(inactive.id).status,
        "Inactive"
      );
    } finally {
      cleanupUpdateSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 5: Invalid Update Fails
test(
  "invalid Resident update fails",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createUpdateSetup();

    try {
      const saved =
        saveResident(
          repository,
          makeValidResident()
        );

      const result =
        service.updateResident(
          saved.id,
          makeValidUpdate({ firstName: "" })
        );

      assert.equal(
        result.success,
        false
      );

      assert.equal(
        result.resident,
        null
      );

      assert.equal(
        result.notFound,
        false
      );

      assert.ok(
        result.errors.includes(
          "firstName"
        )
      );
    } finally {
      cleanupUpdateSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 6: Invalid Update Does Not Modify Persisted Information
test(
  "invalid update does not modify persisted information",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createUpdateSetup();

    try {
      const saved =
        saveResident(
          repository,
          makeValidResident()
        );

      // lastName, address and email are valid; nothing may be partially saved
      const result =
        service.updateResident(
          saved.id,
          makeValidUpdate({
            firstName: "",
            contactNumber: "ABC"
          })
        );

      assert.equal(
        result.success,
        false
      );

      assert.ok(
        result.errors.includes("firstName")
      );

      assert.ok(
        result.errors.includes("contactNumber")
      );

      const stored =
        repository.findById(saved.id);

      assert.deepEqual(
        { ...stored },
        { ...saved }
      );
    } finally {
      cleanupUpdateSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 7: Updating a Nonexistent Resident Is Handled Safely
test(
  "updating a nonexistent Resident returns not found",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createUpdateSetup();

    try {
      const result =
        service.updateResident(
          999999,
          makeValidUpdate()
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
        result.resident,
        null
      );

      assert.deepEqual(
        result.errors,
        []
      );
    } finally {
      cleanupUpdateSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 8: Nonexistent Update Does Not Create a Resident
test(
  "updating a nonexistent Resident does not create a Resident",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createUpdateSetup();

    try {
      saveResident(
        repository,
        makeValidResident()
      );

      const countBefore =
        countResidents(databasePath);

      const result =
        service.updateResident(
          999999,
          makeValidUpdate()
        );

      assert.equal(
        result.notFound,
        true
      );

      assert.equal(
        countResidents(databasePath),
        countBefore
      );

      assert.equal(
        repository.findById(999999),
        null
      );
    } finally {
      cleanupUpdateSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 9: Updated Resident Is Visible Through T05 Querying
test(
  "updated Resident is visible through T05 search and listing",
  () => {
    const {
      databasePath,
      repository,
      service,
      queryService
    } = createUpdateSetup();

    try {
      const saved =
        saveResident(
          repository,
          makeResident(
            "Juan",
            "Cruz",
            "09171234561",
            "juan@example.com"
          )
        );

      saveResident(
        repository,
        makeResident(
          "Ana",
          "Reyes",
          "09171234562",
          "ana@example.com"
        )
      );

      const result =
        service.updateResident(
          saved.id,
          makeValidUpdate({
            firstName: "Miguel",
            lastName: "Santos"
          })
        );

      assert.equal(
        result.success,
        true
      );

      const found =
        queryService.searchResidents(
          "Miguel"
        );

      assert.equal(
        found.length,
        1
      );

      assert.equal(
        found[0].id,
        saved.id
      );

      assert.deepEqual(
        queryService.searchResidents(
          "Juan"
        ),
        []
      );

      // Reyes now sorts before Santos
      const listed =
        queryService.listResidents();

      assert.deepEqual(
        listed.map(
          (resident) => resident.lastName
        ),
        ["Reyes", "Santos"]
      );
    } finally {
      cleanupUpdateSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 10: Updated Information and Contact Number Are Preserved
test(
  "updated information and contact number leading zero are preserved",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createUpdateSetup();

    try {
      const saved =
        saveResident(
          repository,
          makeValidResident({ status: "Inactive" })
        );

      const other =
        saveResident(
          repository,
          makeResident(
            "Maria",
            "Santos",
            "09171234562",
            "maria@example.com"
          )
        );

      const result =
        service.updateResident(
          saved.id,
          makeValidUpdate({
            contactNumber: "09181234567"
          })
        );

      assert.equal(
        result.success,
        true
      );

      const stored =
        repository.findById(saved.id);

      assert.equal(
        stored.id,
        saved.id
      );

      assert.equal(
        stored.status,
        "Inactive"
      );

      assert.equal(
        stored.contactNumber,
        "09181234567"
      );

      assert.equal(
        typeof stored.contactNumber,
        "string"
      );

      assert.equal(
        stored.firstName,
        "Juan Miguel"
      );

      assert.equal(
        stored.lastName,
        "Santos"
      );

      assert.equal(
        stored.address,
        "Barangay San Antonio"
      );

      assert.equal(
        stored.email,
        "juan.miguel@example.com"
      );

      // the update must target the requested Resident only
      assert.deepEqual(
        { ...repository.findById(other.id) },
        { ...other }
      );
    } finally {
      cleanupUpdateSetup(
        databasePath,
        repository
      );
    }
  }
);
