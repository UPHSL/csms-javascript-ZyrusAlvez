import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), "..", "..");

const DEFAULT_DB_PATH = path.join(projectRoot, "data", "csms.db");

export function openDatabase(dbPath = DEFAULT_DB_PATH) {
  return new DatabaseSync(dbPath);
}