/**
 * Service Request domain model.
 *
 * Represents a community service request owned by a Resident (referenced by residentId).
 * Validation, persistence, and status transitions are introduced by later tickets.
 */
export class ServiceRequest {
  constructor({
    id = null,
    residentId,
    serviceType,
    description,
    dateRequested,
    status = "Pending"
  }) {
    this.id = id;
    this.residentId = residentId;
    this.serviceType = serviceType;
    this.description = description;
    // stored as supplied (e.g. "2026-10-09"); the model never reads the current date
    this.dateRequested = dateRequested;
    this.status = status;
  }
}
