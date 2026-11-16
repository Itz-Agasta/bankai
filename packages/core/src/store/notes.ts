import { NoteResult, ProposedUpdate } from "@bankai/schemas";
import type { Database } from "bun:sqlite";
import { saveUpdates } from "./updates";

/**
 * One transaction: the note and its proposals. The same audio keeps its note id, so a re-run
 * replaces the note, drops pending proposals it no longer makes (approved history stays), and
 * stores each proposal with its current approval. A withdrawn proposal is deleted without an
 * audit event: the log keeps its `proposed` line, and the note no longer lists it.
 */
export function saveNote(db: Database, n: NoteResult, at: string, auditFile: string): void {
  db.transaction(() => {
    const keep = new Set(n.updates.map((u) => u.id));
    const old = db
      .query(`SELECT id FROM updates WHERE verdict_id = $id AND approval = 'pending'`)
      .all({ id: n.id }) as { id: string }[];
    const del = db.query(`DELETE FROM updates WHERE id = $id`);
    for (const r of old) if (!keep.has(r.id)) del.run({ id: r.id });
    saveUpdates(db, n.id, n.updates, auditFile);
    const stored = db.query(`SELECT json FROM updates WHERE id = $id`);
    const updates = n.updates.map((u) => {
      const row = stored.get({ id: u.id }) as { json: string } | null;
      return row ? ProposedUpdate.parse(JSON.parse(row.json)) : u;
    });
    const note = NoteResult.parse({ ...n, updates });
    db.query(
      `INSERT INTO notes (id, json, status, at) VALUES ($id, $json, $status, $at)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json, status = excluded.status, at = excluded.at`,
    ).run({ id: n.id, json: JSON.stringify(note), status: n.status, at });
  })();
}

export function getNote(db: Database, id: string): NoteResult | null {
  const row = db.query(`SELECT json FROM notes WHERE id = $id`).get({ id }) as {
    json: string;
  } | null;
  if (!row) return null;
  const n = NoteResult.parse(JSON.parse(row.json));
  // Approvals happen after the note was saved: read each proposal's current state.
  const stored = db.query(`SELECT json FROM updates WHERE id = $id`);
  const updates = n.updates.map((u) => {
    const r = stored.get({ id: u.id }) as { json: string } | null;
    return r ? ProposedUpdate.parse(JSON.parse(r.json)) : u;
  });
  return { ...n, updates };
}
