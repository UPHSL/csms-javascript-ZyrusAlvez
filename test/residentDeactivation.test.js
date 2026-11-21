import test from "node:test";
import assert from "node:assert/strict";

import { DatabaseSync } from "node:sqlite";

import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ResidentQueryService } from "../src/services/ResidentQueryService.js";
import { ResidentDeactivationService } from "../src/services/ResidentDeactivationService.js";

import { createTemporaryDatabasePath, removeDatabase, makeValidResident, makeResident, saveResident } from "../src/utils/testUtils.js";

function createDeactivationSetup() {
  const databasePath = createTemporaryDatabasePath();

  const repository = new ResidentRepository(databasePath);

  const service = new ResidentDeactivationService(repository);

  const queryService = new ResidentQueryService(repository);

  return {
    databasePath,
    repository,
    service,
    queryService
  };
}

function cleanupDeactivationSetup(
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

// Test 1: Active Resident Can Be Deactivated
test(
  "Active Resident can be deactivated",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createDeactivationSetup();

    try {
      const saved =
        saveResident(
          repository,
          makeValidResident({ status: "Active" })
        );

      const result =
        service.deactivateResident(saved.id);

      assert.equal(
        result.success,
        true
      );

      assert.ok(
        result.resident
      );

      assert.equal(
        result.resident.status,
        "Inactive"
      );

      assert.equal(
        result.alreadyInactive,
        false
      );

      assert.equal(
        result.notFound,
        false
      );
    } finally {
      cleanupDeactivationSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 2: Resident Status Becomes Inactive in Persistence
test(
  "deactivated status is persisted",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createDeactivationSetup();

    try {
      const saved =
        saveResident(
          repository,
          makeValidResident()
        );

      service.deactivateResident(saved.id);

      // a fresh repository proves the change reached the database file
      const freshRepository =
        new ResidentRepository(databasePath);

      try {
        const stored =
          freshRepository.findById(saved.id);

        assert.ok(stored);

        assert.equal(
          stored.status,
          "Inactive"
        );
      } finally {
        freshRepository.close();
      }
    } finally {
      cleanupDeactivationSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 3: Resident ID Is Preserved
test(
  "deactivation preserves the Resident ID",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createDeactivationSetup();

    try {
      const saved =
        saveResident(
          repository,
          makeValidResident()
        );

      const idBefore =
        saved.id;

      const result =
        service.deactivateResident(idBefore);

      assert.equal(
        result.resident.id,
        idBefore
      );

      assert.equal(
        repository.findById(idBefore).id,
        idBefore
      );
    } finally {
      cleanupDeactivationSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 4: Resident Information Is Preserved
test(
  "deactivation preserves Resident information",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createDeactivationSetup();

    try {
      const saved =
        saveResident(
          repository,
          makeValidResident()
        );

      service.deactivateResident(saved.id);

      const stored =
        repository.findById(saved.id);

      assert.equal(
        stored.firstName,
        "Juan"
      );

      assert.equal(
        stored.lastName,
        "Dela Cruz"
      );

      assert.equal(
        stored.address,
        "Barangay Santo Tomas"
      );

      assert.equal(
        stored.contactNumber,
        "09171234567"
      );

      assert.equal(
        stored.email,
        "juan@example.com"
      );

      // only the status may differ from what was saved
      assert.deepEqual(
        { ...stored, status: saved.status },
        { ...saved }
      );
    } finally {
      cleanupDeactivationSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 5: Deactivated Resident Remains Persisted and Retrievable
test(
  "deactivated Resident remains persisted and retrievable",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createDeactivationSetup();

    try {
      const saved =
        saveResident(
          repository,
          makeValidResident()
        );

      const countBefore =
        countResidents(databasePath);

      service.deactivateResident(saved.id);

      // not a physical delete: the row is still there
      assert.equal(
        countResidents(databasePath),
        countBefore
      );

      const stored =
        repository.findById(saved.id);

      assert.ok(stored);

      assert.equal(
        stored.id,
        saved.id
      );

      assert.equal(
        stored.status,
        "Inactive"
      );
    } finally {
      cleanupDeactivationSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 6: Deactivated Resident Remains Available Through T05
test(
  "deactivated Resident remains available through T05 search and listing",
  () => {
    const {
      databasePath,
      repository,
      service,
      queryService
    } = createDeactivationSetup();

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

      service.deactivateResident(saved.id);

      const found =
        queryService.searchResidents(
          "Juan"
        );

      assert.equal(
        found.length,
        1
      );

      assert.equal(
        found[0].id,
        saved.id
      );

      assert.equal(
        found[0].status,
        "Inactive"
      );

      const listed =
        queryService.listResidents();

      const listedResident =
        listed.find(
          (resident) => resident.id === saved.id
        );

      assert.ok(listedResident);

      assert.equal(
        listedResident.status,
        "Inactive"
      );
    } finally {
      cleanupDeactivationSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 7: Already-Inactive Resident Is Handled Safely
test(
  "already-Inactive Resident is handled safely",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createDeactivationSetup();

    try {
      const saved =
        saveResident(
          repository,
          makeValidResident({ status: "Inactive" })
        );

      const countBefore =
        countResidents(databasePath);

      const result =
        service.deactivateResident(saved.id);

      assert.equal(
        result.success,
        true
      );

      assert.equal(
        result.alreadyInactive,
        true
      );

      assert.equal(
        result.notFound,
        false
      );

      assert.equal(
        countResidents(databasePath),
        countBefore
      );

      // still Inactive (not toggled), with the same id and information
      assert.deepEqual(
        { ...repository.findById(saved.id) },
        { ...saved }
      );
    } finally {
      cleanupDeactivationSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 8: Nonexistent Resident Is Handled Safely
test(
  "deactivating a nonexistent Resident returns not found",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createDeactivationSetup();

    try {
      const result =
        service.deactivateResident(999999);

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
    } finally {
      cleanupDeactivationSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 9: Nonexistent Deactivation Does Not Create or Delete Records
test(
  "nonexistent deactivation does not create or delete records",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createDeactivationSetup();

    try {
      const first =
        saveResident(
          repository,
          makeResident(
            "Juan",
            "Cruz",
            "09171234561",
            "juan@example.com"
          )
        );

      const second =
        saveResident(
          repository,
          makeResident(
            "Maria",
            "Santos",
            "09171234562",
            "maria@example.com"
          )
        );

      const countBefore =
        countResidents(databasePath);

      const result =
        service.deactivateResident(999999);

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

      assert.deepEqual(
        { ...repository.findById(first.id) },
        { ...first }
      );

      assert.deepEqual(
        { ...repository.findById(second.id) },
        { ...second }
      );
    } finally {
      cleanupDeactivationSetup(
        databasePath,
        repository
      );
    }
  }
);

// Test 10: Deactivating One Resident Does Not Affect Another
test(
  "deactivating one Resident does not affect another",
  () => {
    const {
      databasePath,
      repository,
      service
    } = createDeactivationSetup();

    try {
      const target =
        saveResident(
          repository,
          makeResident(
            "Juan",
            "Cruz",
            "09171234561",
            "juan@example.com"
          )
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

      service.deactivateResident(target.id);

      assert.equal(
        repository.findById(target.id).status,
        "Inactive"
      );

      // still Active, with the same information
      assert.deepEqual(
        { ...repository.findById(other.id) },
        { ...other }
      );
    } finally {
      cleanupDeactivationSetup(
        databasePath,
        repository
      );
    }
  }
);
