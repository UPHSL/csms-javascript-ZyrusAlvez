// current status -> statuses it may move to.
// Completed and Cancelled are terminal (no allowed targets), and no status lists itself,
// so same-status requests are invalid transitions.
const ALLOWED_TRANSITIONS = {
  "Pending": ["In Progress", "Cancelled"],
  "In Progress": ["Completed", "Cancelled"],
  "Completed": [],
  "Cancelled": []
};

// the only recognized Service Request statuses
const SUPPORTED_STATUSES = new Set(Object.keys(ALLOWED_TRANSITIONS));

export class ServiceRequestStatusService {
  constructor(serviceRequestRepository) {
    this.serviceRequestRepository = serviceRequestRepository;
  }

  // every check runs against the persisted Service Request before anything is written
  changeStatus(id, requestedStatus) {
    // 1. the Service Request must already exist; unknown ids never create a record
    const existing =
      this.serviceRequestRepository.findById(id);

    if (!existing) {
      return this.failure({ notFound: true });
    }

    // 2. the requested status must be one of the four recognized values
    if (!SUPPORTED_STATUSES.has(requestedStatus)) {
      return this.failure({ unsupportedStatus: true });
    }

    // 3. the move from the current persisted status must be allowed
    if (!this.isAllowedTransition(existing.status, requestedStatus)) {
      return this.failure({ invalidTransition: true });
    }

    // 4. only now is persistence modified, and only the status of this Service Request
    const updatedServiceRequest =
      this.serviceRequestRepository.updateStatus(existing.id, requestedStatus);

    return {
      success: true,
      serviceRequest: updatedServiceRequest,
      notFound: false,
      unsupportedStatus: false,
      invalidTransition: false
    };
  }

  isAllowedTransition(currentStatus, requestedStatus) {
    const allowedTargets = ALLOWED_TRANSITIONS[currentStatus] ?? [];
    return allowedTargets.includes(requestedStatus);
  }

  // builds the result for a failed status change so every failure has the same shape;
  // the caller passes only the flag that applies (e.g. { notFound: true }) and the rest default to false
  failure({ notFound = false, unsupportedStatus = false, invalidTransition = false }) {
    return {
      success: false,
      serviceRequest: null,
      notFound,
      unsupportedStatus,
      invalidTransition
    };
  }
}
