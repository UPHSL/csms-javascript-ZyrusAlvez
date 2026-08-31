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