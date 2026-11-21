export class ResidentDeactivationService {
  constructor(repository) {
    this.repository = repository;
  }

  // Active becomes Inactive; an already-Inactive Resident stays Inactive.
  // This is not a toggle, and reactivation is outside T07.
  deactivateResident(id) {
    const existing =
      this.repository.findById(id);

    // unknown id: report not-found instead of creating a Resident
    if (!existing) {
      return {
        success: false,
        resident: null,
        alreadyInactive: false,
        notFound: true
      };
    }

    // repeated deactivation is safe: nothing is written, the Resident is returned as stored
    if (existing.status === "Inactive") {
      return {
        success: true,
        resident: existing,
        alreadyInactive: true,
        notFound: false
      };
    }

    // changes only the status of the existing row (same id), then returns it as stored
    const deactivatedResident =
      this.repository.deactivateById(existing.id);

    return {
      success: true,
      resident: deactivatedResident,
      alreadyInactive: false,
      notFound: false
    };
  }
}
