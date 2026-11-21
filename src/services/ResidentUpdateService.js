import { Resident } from "../models/Resident.js";

export class ResidentUpdateService {
  constructor(validator, repository) {
    this.validator = validator;
    this.repository = repository;
  }

  // proposed may carry some or all of the editable fields
  // (firstName, lastName, address, contactNumber, email);
  // any field left out keeps its currently stored value
  updateResident(id, proposed = {}) {
    const existing =
      this.repository.findById(id);

    // unknown id: report not-found instead of creating a new Resident
    if (!existing) {
      return {
        success: false,
        resident: null,
        errors: [],
        notFound: true
      };
    }

    // same spread pattern as makeValidResident(overrides) in testUtils:
    // start from the stored Resident, then apply only the fields the caller sent.
    // Note: a field explicitly sent as undefined replaces the stored value,
    // and the validator below will then reject it.
    const candidate = new Resident({
      ...existing,
      ...proposed,
      // listed last so the caller can never override them:
      // the id identifies the stored record, and status changes belong to T07
      id: existing.id,
      status: existing.status
    });

    // reuse the T02 rules; nothing is written unless the whole candidate is valid
    const errors = this.validator.validate(candidate);

    if (errors.length > 0) {
      return {
        success: false,
        resident: null,
        errors,
        notFound: false
      };
    }

    // modifies the existing row in place (same id), then returns it as stored
    const updatedResident =
      this.repository.update(candidate);

    return {
      success: true,
      resident: updatedResident,
      errors: [],
      notFound: false
    };
  }
}
