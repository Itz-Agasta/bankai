import { ActorId, ProposedUpdate } from "@bankai/schemas";
import type { Database } from "bun:sqlite";
import { BankaiFailure } from "../errors";
import { appendAudit, type AuditEvent } from "./audit";

const event = (
  u: ProposedUpdate,
  actor: string,
  action: AuditEvent["action"],
  at: string,
): AuditEvent => ({
  at,
  actor,
  action,
  update_id: u.id,
  target: u.target,
  field: u.field,
  old: u.old,
  new: u.new,
  evidence: u.evidence,
});

/** Proposals always enter pending; only approveUpdate approves. Rows and audit lines commit together. */
export function saveUpdates(
  db: Database,
  verdictId: string,
  us: ProposedUpdate[],
  auditFile: string,
): void {
  const at = new Date().toISOString();
  const insert = db.query(
    `INSERT INTO updates (id, verdict_id, json, approval) VALUES ($id, $vid, $json, 'pending')
     ON CONFLICT(id) DO NOTHING`,
  );
  db.transaction(() => {
    const events: AuditEvent[] = [];
    for (const u of us) {
      const pending = ProposedUpdate.parse({
        ...u,
        approval: "pending",
        approved_by: null,
        at: null,
      });
      const r = insert.run({ id: u.id, vid: verdictId, json: JSON.stringify(pending) });
      if (r.changes > 0) events.push(event(pending, "bankai", "proposed", at));
    }
    appendAudit(auditFile, events);
  })();
}

export function getUpdate(db: Database, id: string): ProposedUpdate | null {
  const row = db.query(`SELECT json FROM updates WHERE id = $id`).get({ id }) as {
    json: string;
  } | null;
  return row ? ProposedUpdate.parse(JSON.parse(row.json)) : null;
}

export function pendingUpdates(db: Database): ProposedUpdate[] {
  const rows = db
    .query(`SELECT json FROM updates WHERE approval = 'pending' ORDER BY rowid`)
    .all() as { json: string }[];
  return rows.map((r) => ProposedUpdate.parse(JSON.parse(r.json)));
}

function mustGet(db: Database, id: string): ProposedUpdate {
  const u = getUpdate(db, id);
  if (!u) throw new BankaiFailure("NOT_FOUND", `no proposed update ${id}`);
  return u;
}

/** Idempotent: approving twice returns the first approval. Read, check and write hold one write lock. */
export function approveUpdate(
  db: Database,
  id: string,
  by: string,
  at: string,
  auditFile: string,
): ProposedUpdate {
  const actor = ActorId.parse(by);
  return db
    .transaction(() => {
      const u = mustGet(db, id);
      if (u.approval === "approved") return u;
      if (u.approval === "rejected")
        throw new BankaiFailure("APPROVAL_REQUIRED", `update ${id} was rejected`);
      const approved: ProposedUpdate = { ...u, approval: "approved", approved_by: actor, at };
      db.query(
        `UPDATE updates SET json = $json, approval = 'approved', approved_by = $by, at = $at WHERE id = $id`,
      ).run({ json: JSON.stringify(approved), by: actor, at, id });
      appendAudit(auditFile, [event(approved, actor, "approved", at)]);
      return approved;
    })
    .immediate();
}

/** A declined approval leaves the update pending; only a pending update's decline is logged. */
export function declineUpdate(
  db: Database,
  id: string,
  by: string,
  at: string,
  auditFile: string,
): void {
  const actor = ActorId.parse(by);
  const u = mustGet(db, id);
  if (u.approval !== "pending") return;
  appendAudit(auditFile, [event(u, actor, "declined", at)]);
}
