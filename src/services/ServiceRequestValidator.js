// project-standard date representation (same format persisted in SQLite)
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const INITIAL_STATUS = "Pending";

// checks the Service Request information itself;
// Resident existence/eligibility is checked by ServiceRequestSubmissionService
export class ServiceRequestValidator {
  validate(serviceRequest) {
    const errors = [];

    // a new submission must not already carry a persisted id
    if (!this.isUnassigned(serviceRequest.id)) {
      errors.push("id");
    }

    if (!this.isValidResidentId(serviceRequest.residentId)) {
      errors.push("residentId");
    }

    if (this.isBlank(serviceRequest.serviceType)) {
      errors.push("serviceType");
    }

    if (this.isBlank(serviceRequest.description)) {
      errors.push("description");
    }

    if (!this.isValidDate(serviceRequest.dateRequested)) {
      errors.push("dateRequested");
    }

    // a new request may only start as Pending
    if (serviceRequest.status !== INITIAL_STATUS) {
      errors.push("status");
    }

    return errors;
  }

  isValid(serviceRequest) {
    return this.validate(serviceRequest).length === 0;
  }

  isUnassigned(value) {
    return value === null || value === undefined;
  }

  // structural check only: a positive whole number
  isValidResidentId(value) {
    return (
      Number.isInteger(value) &&
      value > 0
    );
  }

  isBlank(value) {
    return (
      typeof value !== "string" ||
      value.trim().length === 0
    );
  }

  // accepts YYYY-MM-DD only, and only real calendar dates (rejects e.g. 2026-02-30)
  isValidDate(value) {
    if (typeof value !== "string") {
      return false;
    }

    const match = DATE_PATTERN.exec(value);

    if (!match) {
      return false;
    }

    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }
}
