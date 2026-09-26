import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Resident } from "../src/models/Resident.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { makeValidResident } from "../src/utils/testUtils.js";

// helper function to create a repository using the default database
function createTestRepository() {
  return new ResidentRepository();
}

// Required Test 1 - Persist a Resident
test("persist a resident", (t) => {
  const repository = createTestRepository();
  t.after(() => { repository.close()});

  const resident = makeValidResident();
  const saved = repository.save(resident);

  assert.notEqual(saved, null);
  assert.equal(saved.firstName, "Juan");
  assert.equal(saved.lastName, "Dela Cruz");
});

// Required Test 2 - Resident Receives an Identifier
test("resident receives an identifier after saving", (t) => {
  const repository = createTestRepository();
  t.after(() => { repository.close()});

  const resident = makeValidResident();

  assert.equal(resident.id, null);

  const saved = repository.save(resident);

  assert.notEqual(saved.id, null);
  assert.equal(typeof saved.id, "number");
});

// Required Test 3 - Retrieve Resident by Identifier
test("retrieve resident by identifier", (t) => {
  const repository = createTestRepository();
  t.after(() => { repository.close()});

  const saved = repository.save(makeValidResident());
  const found = repository.findById(saved.id);

  assert.notEqual(found, null);
  assert.equal(found.id, saved.id);
});

// Required Test 4 - Preserve Resident Information
test("preserve resident information after save and retrieval", (t) => {
  const repository = createTestRepository();
  t.after(() => { repository.close()});

  const resident = makeValidResident({
    firstName: "Maria",
    lastName: "Santos",
    address: "123 Rizal Street",
    contactNumber: "09181234567",
    email: "maria@example.com",
    status: "Active"
  });

  const saved = repository.save(resident);
  const found = repository.findById(saved.id);

  assert.equal(found.firstName, "Maria");
  assert.equal(found.lastName, "Santos");
  assert.equal(found.address, "123 Rizal Street");
  assert.equal(found.contactNumber, "09181234567");
  assert.equal(found.email, "maria@example.com");
  assert.equal(found.status, "Active");
});

// Required Test 5 - Preserve Active Status
test("preserve active status after persistence", (t) => {
  const repository = createTestRepository();
  t.after(() => { repository.close()});

  const resident = makeValidResident({ status: "Active" });
  const saved = repository.save(resident);
  const found = repository.findById(saved.id);

  assert.equal(found.status, "Active");
});

// Required Test 6 - Missing Resident
test("findById returns null for missing resident", (t) => {
  const repository = createTestRepository();
  t.after(() => { repository.close()});

  const found = repository.findById(9999999999); // using a very large number to ensure it doesn't exist

  assert.equal(found, null);
});

// Required Test 7 - Verify Real Persistence
test("verify real persistence across repository instances", (t) => {
  
  // creates a unique temp file path; the OS cleans up /tmp/ automatically
  const dbPath = path.join(os.tmpdir(), `csms-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

  const firstRepository = new ResidentRepository(dbPath);

  const saved = firstRepository.save(makeValidResident({
    firstName: "Zyrus",
    lastName: "Alvez",
    address: "Langkiwa",
    contactNumber: "09123456789",
    email: "zyrusalvez13@gmail.com",
    status: "Active"
  }));

  const savedId = saved.id;
  firstRepository.close();

  const secondRepository = new ResidentRepository(dbPath);

  const found = secondRepository.findById(savedId);

  assert.notEqual(found, null);
  assert.equal(found.id, savedId);
  assert.equal(found.firstName, "Zyrus");
  assert.equal(found.lastName, "Alvez");
  assert.equal(found.address, "Langkiwa");
  assert.equal(found.contactNumber, "09123456789");
  assert.equal(found.email, "zyrusalvez13@gmail.com");
  assert.equal(found.status, "Active");

  secondRepository.close();
});

// Step 18 - Student-Designed Persistence Test
// Verifies that saving multiple residents assigns each a unique identifier
// and that earlier records are not overwritten by later ones.
// This catches defects like ID collisions or if the repository only tracking the last-saved record.
test("multiple residents receive unique identifiers", (t) => {
  const repository = createTestRepository();
  t.after(() => { repository.close()});

  const first = repository.save(makeValidResident({
    firstName: "Ether",
    lastName: "Cruz",
    contactNumber: "09171230000",
    email: "ana@example.com"
  }));

  const second = repository.save(makeValidResident({
    firstName: "Carlos",
    lastName: "Garcia",
    contactNumber: "09181230000",
    email: "carlos@example.com"
  }));

  assert.notEqual(first.id, second.id);
  assert.equal(repository.findById(first.id).firstName, "Ether");
  assert.equal(repository.findById(second.id).firstName, "Carlos");
});
