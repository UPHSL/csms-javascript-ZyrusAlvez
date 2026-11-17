export const RECENT_SERVICE_REQUEST_LIMIT = 5;

// Read-only application service for the CSMS Dashboard (T14).
// Composes aggregate counts that the repositories compute in SQL and derives the
// Open Service Request metric. It never writes, validates, or renders anything.
export class DashboardService {
  constructor(residentRepository, serviceRequestRepository) {
    this.residentRepository = residentRepository;
    this.serviceRequestRepository = serviceRequestRepository;
  }

  getSummary() {
    return {
      residents: this.getResidentSummary(),
      serviceRequests: this.getServiceRequestSummary(),
      recentServiceRequests:
        this.serviceRequestRepository.findRecent(RECENT_SERVICE_REQUEST_LIMIT)
    };
  }

  getResidentSummary() {
    const byStatus = this.residentRepository.countByStatus();

    return {
      total: this.residentRepository.countAll(),
      active: byStatus["Active"] ?? 0,
      inactive: byStatus["Inactive"] ?? 0
    };
  }

  getServiceRequestSummary() {
    const byStatus = this.serviceRequestRepository.countByStatus();

    const pending = byStatus["Pending"] ?? 0;
    const inProgress = byStatus["In Progress"] ?? 0;

    return {
      total: this.serviceRequestRepository.countAll(),
      pending,
      inProgress,
      completed: byStatus["Completed"] ?? 0,
      cancelled: byStatus["Cancelled"] ?? 0,
      // derived metric, not a stored status: requests that are not yet terminal
      open: pending + inProgress
    };
  }
}
