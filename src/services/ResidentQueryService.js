export class ResidentQueryService {
  constructor(repository) {
    this.repository = repository;
  }

  listResidents() {
    return this.repository.findAll();
  }

  // one Resident by id through the T03 findById; an unknown id returns null
  findResident(id) {
    return this.repository.findById(id);
  }

  searchResidents(searchTerm) {
    const normalizedSearchTerm =
      typeof searchTerm === "string"
        ? searchTerm.trim()
        : "";

    if (
      normalizedSearchTerm.length === 0
    ) {
      return this.listResidents();
    }

    return this.repository.searchByName(
      normalizedSearchTerm
    );
  }
}