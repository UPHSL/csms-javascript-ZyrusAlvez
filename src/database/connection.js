import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), "..", "..");

const DEFAULT_DB_PATH = path.join(projectRoot, "data", "csms.db");

// how long a connection waits for another connection's lock before failing.
// Several connections can use the same file at once (each repository opens its own,
// the dev server, and test files that run in parallel).
const BUSY_TIMEOUT_MS = 5000;

export function openDatabase(dbPath = DEFAULT_DB_PATH) {
  // data/ is not versioned (*.db is git-ignored), so a fresh clone has no such folder;
  // SQLite creates the file but not its directory
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  return new DatabaseSync(dbPath, { timeout: BUSY_TIMEOUT_MS });
}
