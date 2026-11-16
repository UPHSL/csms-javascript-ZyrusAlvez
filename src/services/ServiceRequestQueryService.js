import { SUPPORTED_STATUSES } from "./ServiceRequestStatusService.js";

// raised when a non-empty status filter is not one of the four Service Request statuses
export class UnsupportedStatusFilterError extends Error {
  constructor(statusFilter) {
    super(
      `Unsupported Service Request status filter: "${statusFilter}". ` +
      `Supported statuses: ${[...SUPPORTED_STATUSES].join(", ")}.`
    );
    this.name = "UnsupportedStatusFilterError";
    this.statusFilter = statusFilter;
  }
}

// Read-only application layer for Service Requests (T11).
// Coordinates listing, viewing, and search/filter input handling;
// the repository owns the SQL, and status transitions stay in ServiceRequestStatusService.
export class ServiceRequestQueryService {
  constructor(serviceRequestRepository) {
    this.serviceRequestRepository = serviceRequestRepository;
  }

  // all Service Requests, every status included, newest dateRequested first (then id DESC)
  listServiceRequests() {
    return this.serviceRequestRepository.findAll();
  }

  // reuses the T09 findById; an unknown id returns null and nothing is written
  viewServiceRequest(serviceRequestId) {
    if (!Number.isInteger(serviceRequestId) || serviceRequestId <= 0) {
      return null;
    }

    return this.serviceRequestRepository.findById(serviceRequestId);
  }

  // searchTerm: matched against serviceType OR description (partial, case-insensitive,
  //   surrounding whitespace ignored); blank or absent means "no text condition".
  // statusFilter: one of the four statuses; blank or absent means "all statuses".
  // Throws UnsupportedStatusFilterError for any other non-empty status filter.
  searchServiceRequests(searchTerm, statusFilter) {
    const normalizedSearchTerm = this.normalize(searchTerm);
    const normalizedStatus = this.normalize(statusFilter);

    if (normalizedStatus !== null && !SUPPORTED_STATUSES.has(normalizedStatus)) {
      throw new UnsupportedStatusFilterError(statusFilter);
    }

    // no conditions at all is the normal listing
    if (normalizedSearchTerm === null && normalizedStatus === null) {
      return this.listServiceRequests();
    }

    return this.serviceRequestRepository.search({
      searchTerm: normalizedSearchTerm,
      status: normalizedStatus
    });
  }

  // trims input; non-strings and blank strings become null (meaning "not supplied")
  normalize(value) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
