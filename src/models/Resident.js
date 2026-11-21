/**
 * Resident domain model (T01).
 *
 * A new Resident has no id until persisted and starts Active.
 * Validation (T02) and persistence (T03) live in their own layers.
 */
export class Resident {
  constructor({
    id = null,
    firstName,
    lastName,
    address,
    contactNumber,
    email,
    status = "Active"
  }) {
    this.id = id;
    this.firstName = firstName;
    this.lastName = lastName;
    this.address = address;
    this.contactNumber = contactNumber;
    this.email = email;
    this.status = status;
  }
}