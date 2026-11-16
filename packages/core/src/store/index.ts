import type { ProposedUpdate, TraceEvent, Verdict } from "@bankai/schemas";
import { join } from "node:path";
import type { Tracer } from "../models/meter";
import { openDb } from "./db";
import { dbTracer, readTrace } from "./trace";
import { approveUpdate, declineUpdate, getUpdate, pendingUpdates, saveUpdates } from "./updates";
import { getVerdict, openItems, resolve, saveVerdict, type OpenItem } from "./verdicts";

export { appendAudit, auditPath, type AuditEvent } from "./audit";

export type { OpenItem } from "./verdicts";

/** Memory across days (D28) and the step log (D29) in one SQLite file. */
export interface Store {
  saveVerdict(v: Verdict, at: string): void;
  getVerdict(id: string): Verdict | null;
  openItems(): OpenItem[];
  resolve(verdictId: string, by: string, at: string): void;
  tracer(runId: string): Tracer;
  trace(runId: string): TraceEvent[];
  saveUpdates(verdictId: string, us: ProposedUpdate[], auditFile: string): void;
  getUpdate(id: string): ProposedUpdate | null;
  pendingUpdates(): ProposedUpdate[];
  approveUpdate(id: string, by: string, at: string, auditFile: string): ProposedUpdate;
  declineUpdate(id: string, by: string, at: string, auditFile: string): void;
  close(): void;
}

/** Where a project's state lives: `<project>/.bankai/state.db` (gitignored). */
export const storePath = (projectDir: string) => join(projectDir, ".bankai", "state.db");

export function openStore(path: string): Store {
  const db = openDb(path);
  return {
    saveVerdict: (v, at) => saveVerdict(db, v, at),
    getVerdict: (id) => getVerdict(db, id),
    openItems: () => openItems(db),
    resolve: (id, by, at) => resolve(db, id, by, at),
    tracer: (runId) => dbTracer(db, runId),
    trace: (runId) => readTrace(db, runId),
    saveUpdates: (vid, us, file) => saveUpdates(db, vid, us, file),
    getUpdate: (id) => getUpdate(db, id),
    pendingUpdates: () => pendingUpdates(db),
    approveUpdate: (id, by, at, file) => approveUpdate(db, id, by, at, file),
    declineUpdate: (id, by, at, file) => declineUpdate(db, id, by, at, file),
    close: () => db.close(),
  };
}
