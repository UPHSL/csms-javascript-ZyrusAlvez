import { openDatabase } from "../database/connection.js";
import { Resident } from "../models/Resident.js";

export class ResidentRepository {
  // opens its own connection; omitting dbPath falls back to the default database
  constructor(dbPath) {
    this.db = openDatabase(dbPath);
    this.initialize();
  }

  close() {
    this.db.close();
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

  // modifies only the editable fields of the Resident identified by resident.id;
  // id and status are never written, and a missing id updates nothing
  update(resident) {
    const result = this.db.prepare(
      `UPDATE residents
       SET first_name = ?, last_name = ?, address = ?, contact_number = ?, email = ?
       WHERE id = ?`
    ).run(
      resident.firstName,
      resident.lastName,
      resident.address,
      resident.contactNumber,
      resident.email,
      resident.id
    );

    return result.changes > 0 ? this.findById(resident.id) : null;
  }

  findAll() {
    const statement =
      this.db.prepare(`
        SELECT
          id,
          first_name,
          last_name,
          address,
          contact_number,
          email,
          status
        FROM residents
        ORDER BY
          LOWER(last_name) ASC,
          LOWER(first_name) ASC,
          id ASC
      `);

    const rows = statement.all();

    return rows.map((row) => this.toResident(row));
  }

  searchByName(searchTerm) {
    const statement =
      this.db.prepare(`
        SELECT
          id,
          first_name,
          last_name,
          address,
          contact_number,
          email,
          status
        FROM residents
        WHERE
          LOWER(first_name) LIKE LOWER(?)
          OR LOWER(last_name) LIKE LOWER(?)
        ORDER BY
          LOWER(last_name) ASC,
          LOWER(first_name) ASC,
          id ASC
      `);

    const pattern = `%${searchTerm}%`;

    const rows = statement.all(pattern, pattern);

    return rows.map((row) => this.toResident(row));
  }
}