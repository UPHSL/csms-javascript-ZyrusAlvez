import { Resident } from "../models/Resident.js";

export class ResidentRepository {
  constructor(db) {
    this.db = db;
    this.initialize();
  }

  // no need to call this method outside the class; its in the constructor
  initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS residents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        address TEXT NOT NULL,
        contact_number TEXT NOT NULL,
        email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active'
      )
    `);
  }

  // converts a database row into a Resident instance
  // Reconstructing the Resident Domain Model (Step 13)
  toResident(row) {
    return new Resident({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      address: row.address,
      contactNumber: row.contact_number,
      email: row.email,
      status: row.status
    });
  }

  findById(id) {
    const row = this.db.prepare("SELECT * FROM residents WHERE id = ?").get(id);
    return row ? this.toResident(row) : null;
  }

  save(resident) {
    const result = this.db.prepare(
      `INSERT INTO residents (first_name, last_name, address, contact_number, email, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      resident.firstName,
      resident.lastName,
      resident.address,
      resident.contactNumber,
      resident.email,
      resident.status
    );

    return this.findById(result.lastInsertRowid);
  }
}