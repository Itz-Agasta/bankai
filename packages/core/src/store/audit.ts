import type { Citation } from "@bankai/schemas";
import { appendFileSync } from "node:fs";

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

/** One write per call, so a batch lands whole or not at all. */
export function appendAudit(path: string, events: AuditEvent[]): void {
  if (events.length === 0) return;
  appendFileSync(path, events.map((e) => `${JSON.stringify(e)}\n`).join(""));
}
