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

export function saveUpdates(
  db: Database,
  verdictId: string,
  us: ProposedUpdate[],
  auditFile: string,
): void {
  const at = new Date().toISOString();
  const insert = db.query(
    `INSERT INTO updates (id, verdict_id, json, approval, approved_by, at) VALUES ($id, $vid, $json, $approval, $by, $at)
     ON CONFLICT(id) DO NOTHING`,
  );
  db.transaction(() => {
    for (const u of us) {
      const r = insert.run({
        id: u.id,
        vid: verdictId,
        json: JSON.stringify(ProposedUpdate.parse(u)),
        approval: u.approval,
        by: u.approved_by,
        at: u.at,
      });
      if (r.changes > 0) appendAudit(auditFile, event(u, "bankai", "proposed", at));
    }
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
    .all() as {
    json: string;
  }[];
  return rows.map((r) => ProposedUpdate.parse(JSON.parse(r.json)));
}

function mustGet(db: Database, id: string): ProposedUpdate {
  const u = getUpdate(db, id);
  if (!u) throw new BankaiFailure("NOT_FOUND", `no proposed update ${id}`);
  return u;
}

/** Idempotent: approving twice returns the first approval. The audit line and the row commit together. */
export function approveUpdate(
  db: Database,
  id: string,
  by: string,
  at: string,
  auditFile: string,
): ProposedUpdate {
  const actor = ActorId.parse(by);
  const u = mustGet(db, id);
  if (u.approval === "approved") return u;
  if (u.approval === "rejected")
    throw new BankaiFailure("APPROVAL_REQUIRED", `update ${id} was rejected`);
  const approved: ProposedUpdate = { ...u, approval: "approved", approved_by: actor, at };
  db.transaction(() => {
    db.query(
      `UPDATE updates SET json = $json, approval = 'approved', approved_by = $by, at = $at WHERE id = $id`,
    ).run({
      json: JSON.stringify(approved),
      by: actor,
      at,
      id,
    });
    appendAudit(auditFile, event(approved, actor, "approved", at));
  })();
  return approved;
}

/** A declined approval leaves the update pending; only the audit log records it. */
export function declineUpdate(
  db: Database,
  id: string,
  by: string,
  at: string,
  auditFile: string,
): void {
  const actor = ActorId.parse(by);
  appendAudit(auditFile, event(mustGet(db, id), actor, "declined", at));
}
