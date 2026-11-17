import assert from "node:assert/strict";
import test, { after } from "node:test";

import request from "supertest";

import { createApp } from "../src/app.js";
import { Resident } from "../src/models/Resident.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { ResidentValidator } from "../src/services/ResidentValidator.js";
import { createTemporaryDatabasePath, makeValidResident, removeDatabase } from "../src/utils/testUtils.js";

// T15: the starter routes run on a temporary database instead of the permanent
// data/csms.db, so the suite never depends on (or touches) local development data
const databasePath = createTemporaryDatabasePath();
const residentRepository = new ResidentRepository(databasePath);
const serviceRequestRepository = new ServiceRequestRepository(databasePath);

const app = createApp({ residentRepository, serviceRequestRepository });

after(() => {
  residentRepository.close();
  serviceRequestRepository.close();
  removeDatabase(databasePath);
});

test("home page returns successfully", async () => {
  const response = await request(app).get("/");

  assert.equal(response.statusCode, 200);
});

test("home page displays the CSMS starter details", async () => {
  const response = await request(app).get("/");

  assert.match(
    response.text,
    /Community Services Management System/
  );

  assert.match(
    response.text,
    /Sprint 0 - Developer Onboarding/
  );

  assert.match(
    response.text,
    /JavaScript with Express\.js/
  );

  assert.match(response.text, /0\.1\.0/);
});

test("health endpoint returns the expected payload", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.statusCode, 200);

  assert.deepEqual(response.body, {
    status: "ok",
    application: "Community Services Management System",
    version: "0.1.0"
  });
});

test("unknown route returns HTTP 404", async () => {
  const response = await request(app).get("/does-not-exist");

  assert.equal(response.statusCode, 404);

  assert.deepEqual(response.body, {
    status: "error",
    message: "Resource not found"
  });
});

test("resident can be created with required information", () => {
  const resident = new Resident({
    id: 1,
    firstName: "Juan",
    lastName: "Dela Cruz",
    address: "Barangay Santo Tomas",
    contactNumber: "09171234567",
    email: "juan@example.com",
    status: "Active"
  });

  assert.equal(resident.id, 1);
  assert.equal(resident.firstName, "Juan");
  assert.equal(resident.lastName, "Dela Cruz");
  assert.equal(resident.address, "Barangay Santo Tomas");
  assert.equal(resident.contactNumber, "09171234567");
  assert.equal(resident.email, "juan@example.com");
  assert.equal(resident.status, "Active");
});

test("resident information can be accessed and updated", () => {
  const resident = new Resident({
    firstName: "Maria",
    lastName: "Santos",
    address: "Barangay Santo Tomas",
    contactNumber: "09181234567",
    email: "maria@example.com"
  });

  resident.contactNumber = "09991234567";
  resident.email = "maria.santos@example.com";

  assert.equal(resident.firstName, "Maria");
  assert.equal(resident.lastName, "Santos");
  assert.equal(resident.address, "Barangay Santo Tomas");
  assert.equal(resident.contactNumber, "09991234567");
  assert.equal(resident.email, "maria.santos@example.com");
});

test("resident defaults to active status", () => {
  const resident = new Resident({
    firstName: "Pedro",
    lastName: "Reyes",
    address: "Barangay Santo Tomas",
    contactNumber: "09191234567",
    email: "pedro@example.com"
  });

  assert.equal(resident.status, "Active");
});

test("resident defaults to null id before persistence", () => {
  const resident = new Resident({
    firstName: "Ana",
    lastName: "Cruz",
    address: "Barangay Santo Tomas",
    contactNumber: "09171230000",
    email: "ana@example.com"
  });

  assert.equal(resident.id, null);
});

test("valid resident information passes validation", () => {
  const resident = makeValidResident();
  const validator = new ResidentValidator();

  assert.equal(validator.isValid(resident), true);
});

test("missing first name fails validation", () => {
  const resident = makeValidResident({
    firstName: ""
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("firstName"), true);
});

test("missing last name fails validation", () => {
  const resident = makeValidResident({
    lastName: ""
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("lastName"), true);
});

test("missing address fails validation", () => {
  const resident = makeValidResident({
    address: ""
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("address"), true);
});

test("whitespace-only required information fails validation", () => {
  const resident = makeValidResident({
    firstName: "   "
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("firstName"), true);
});

test("invalid contact number fails validation", () => {
  const resident = makeValidResident({
    contactNumber: "0917ABC4567"
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("contactNumber"), true);
});

test("invalid email fails validation", () => {
  const resident = makeValidResident({
    email: "juan.example.com"
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("email"), true);
});

test("supported resident statuses pass validation", () => {
  const activeResident = makeValidResident({
    status: "Active"
  });

  const inactiveResident = makeValidResident({
    status: "Inactive"
  });

  const validator = new ResidentValidator();

  assert.equal(validator.isValid(activeResident), true);
  assert.equal(validator.isValid(inactiveResident), true);
});

test("unsupported resident status fails validation", () => {
  const resident = makeValidResident({
    status: "Unknown"
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("status"), true);
});