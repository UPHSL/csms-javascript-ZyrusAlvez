export class ServiceRequestSubmissionService {
  constructor(validator, serviceRequestRepository, residentRepository) {
    this.validator = validator;
    this.serviceRequestRepository = serviceRequestRepository;
    this.residentRepository = residentRepository;
  }

  // every check runs before anything is saved, so a failed submission persists nothing
  submitServiceRequest(serviceRequest) {
    // 1. intrinsic information (id, residentId, serviceType, description, dateRequested, status)
    const errors = this.validator.validate(serviceRequest);

    if (errors.length > 0) {
      return this.failure({ errors });
    }

    // 2. the referenced Resident must exist
    const resident =
      this.residentRepository.findById(serviceRequest.residentId);

    if (!resident) {
      return this.failure({ residentNotFound: true });
    }

    // 3. only Active Residents may submit new Service Requests (T07 soft deactivation)
    if (resident.status !== "Active") {
      return this.failure({ residentInactive: true });
    }

    // 4. persist; the database generates the id and the status stays Pending
    const persistedServiceRequest =
      this.serviceRequestRepository.save(serviceRequest);

    return {
      success: true,
      serviceRequest: persistedServiceRequest,
      errors: [],
      residentNotFound: false,
      residentInactive: false
    };
  }

  failure({ errors = [], residentNotFound = false, residentInactive = false }) {
    return {
      success: false,
      serviceRequest: null,
      errors,
      residentNotFound,
      residentInactive
    };
  }
}
