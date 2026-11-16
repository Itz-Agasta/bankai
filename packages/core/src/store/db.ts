import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS verdicts (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  status TEXT NOT NULL,
  subject_tag TEXT,
  at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS verdicts_open ON verdicts (resolved_at, at);
CREATE TABLE IF NOT EXISTS trace (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  json TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trace_run ON trace (run_id, seq);
`;

/** SQLite file with WAL (readers do not block the writer) and the schema in place. */
export function openDb(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}
