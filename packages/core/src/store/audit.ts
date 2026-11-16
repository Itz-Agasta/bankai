import type { Citation } from "@bankai/schemas";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

export interface AuditEvent {
  at: string;
  actor: string;
  action: "proposed" | "approved" | "declined";
  update_id: string;
  target: Citation;
  field: string;
  old: string;
  new: string;
  evidence: Citation[];
}

/** Append-only log next to the state db, one JSON line per event. */
export const auditPath = (projectDir: string) => join(projectDir, ".bankai", "audit.jsonl");

export function appendAudit(path: string, e: AuditEvent): void {
  appendFileSync(path, `${JSON.stringify(e)}\n`);
}
