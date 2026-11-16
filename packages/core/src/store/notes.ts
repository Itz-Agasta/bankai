import { NoteResult } from "@bankai/schemas";
import type { Database } from "bun:sqlite";

/** The same audio always has the same note id: a re-run replaces the stored result. */
export function saveNote(db: Database, n: NoteResult, at: string): void {
  db.query(
    `INSERT INTO notes (id, json, status, at) VALUES ($id, $json, $status, $at)
     ON CONFLICT(id) DO UPDATE SET json = excluded.json, status = excluded.status, at = excluded.at`,
  ).run({ id: n.id, json: JSON.stringify(NoteResult.parse(n)), status: n.status, at });
}

export function getNote(db: Database, id: string): NoteResult | null {
  const row = db.query(`SELECT json FROM notes WHERE id = $id`).get({ id }) as {
    json: string;
  } | null;
  return row ? NoteResult.parse(JSON.parse(row.json)) : null;
}
