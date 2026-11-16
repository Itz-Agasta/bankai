import { ActorId, Verdict, type Check } from "@bankai/schemas";
import type { Database } from "bun:sqlite";

export interface OpenItem {
  verdict_id: string;
  subject_tag: string | null;
  status: "flagged" | "needs_human";
  /** First failing check's reason, else the first unknown one. */
  reason: string;
  retake: boolean;
  since: string;
}

const reasonOf = (checks: Check[]) =>
  (checks.find((c) => c.result === "fail") ?? checks.find((c) => c.result === "unknown"))?.reason ??
  // Every check passed or was cited yet the verdict is not confirmed: the confidence gate stopped it.
  "confidence below threshold";

export function saveVerdict(db: Database, v: Verdict, at: string): void {
  db.query(
    `INSERT INTO verdicts (id, json, status, subject_tag, at) VALUES ($id, $json, $status, $tag, $at)
     ON CONFLICT(id) DO UPDATE SET json = excluded.json, status = excluded.status, subject_tag = excluded.subject_tag, at = excluded.at`,
  ).run({
    id: v.id,
    json: JSON.stringify(Verdict.parse(v)),
    status: v.status,
    tag: v.subject_tag,
    at,
  });
}

/** Stored JSON is re-validated on read: a hand-edited or stale row fails loudly, not downstream. */
export function getVerdict(db: Database, id: string): Verdict | null {
  const row = db.query(`SELECT json FROM verdicts WHERE id = $id`).get({ id }) as {
    json: string;
  } | null;
  return row ? Verdict.parse(JSON.parse(row.json)) : null;
}

export function openItems(db: Database): OpenItem[] {
  const rows = db
    .query(
      `SELECT json, at FROM verdicts WHERE resolved_at IS NULL AND status IN ('flagged', 'needs_human') ORDER BY at, id`,
    )
    .all() as { json: string; at: string }[];
  return rows.map(({ json, at }) => {
    const v = Verdict.parse(JSON.parse(json));
    return {
      verdict_id: v.id,
      subject_tag: v.subject_tag,
      status: v.status as OpenItem["status"],
      reason: reasonOf(v.checks),
      retake: v.retake_request !== null,
      since: at,
    };
  });
}

/** Closing an item is a human act, recorded by role id only (D31). */
export function resolve(db: Database, verdictId: string, by: string, at: string): void {
  const actor = ActorId.parse(by);
  const r = db
    .query(
      `UPDATE verdicts SET resolved_by = $actor, resolved_at = $at WHERE id = $id AND resolved_at IS NULL`,
    )
    .run({ actor, at, id: verdictId });
  if (r.changes === 0) throw new Error(`no open verdict ${verdictId}`);
}
