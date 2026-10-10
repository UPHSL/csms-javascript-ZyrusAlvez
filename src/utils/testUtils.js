import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Resident } from "../models/Resident.js";

// from T02 Testing
// decided to make it a utility function since it is being used in multiple test files
export function makeValidResident(overrides = {}) {
  return new Resident({
    firstName: "Juan",
    lastName: "Dela Cruz",
    address: "Barangay Santo Tomas",
    contactNumber: "09171234567",
    email: "juan@example.com",
    status: "Active",
    ...overrides
  });
}

// from T05 Testing
export function makeResident(
  firstName,
  lastName,
  contactNumber,
  email,
  status = "Active"
) {
  return new Resident({
    firstName,
    lastName,
    address: "Barangay Santo Tomas",
    contactNumber,
    email,
    status
  });
}

// from T05 Testing
export function saveResident(repository,resident) {
  return repository.save(
    resident
  );
}

// from T04 Testing
export function makeResidentWithMissingFirstName() {
  return new Resident({
    firstName: "",
    lastName: "Dela Cruz",
    address: "Barangay Santo Tomas",
    contactNumber: "09171234567",
    email: "juan@example.com"
  });
}

// from T04 Testing
export function createTemporaryDatabasePath() {
  const fileName =
    `csms-t04-${crypto.randomUUID()}.sqlite`;

  return path.join(
    os.tmpdir(),
    fileName
  );
}

// from T04 Testing
export function removeDatabase(databasePath) {
  if (fs.existsSync(databasePath)) {
    fs.unlinkSync(databasePath);
  }
}