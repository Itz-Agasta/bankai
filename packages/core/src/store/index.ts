import type { ProposedUpdate, TraceEvent, Verdict } from "@bankai/schemas";
import { dirname, join } from "node:path";
import type { Tracer } from "../models/meter";
import { openDb } from "./db";
import { dbTracer, readTrace } from "./trace";
import { approveUpdate, declineUpdate, getUpdate, pendingUpdates, saveUpdates } from "./updates";
import { getVerdict, openItems, resolve, saveVerdict, type OpenItem } from "./verdicts";

export type { AuditEvent } from "./audit";

export type { OpenItem } from "./verdicts";

/** Memory across days (D28) and the step log (D29) in one SQLite file. */
export interface Store {
  saveVerdict(v: Verdict, at: string): void;
  getVerdict(id: string): Verdict | null;
  openItems(): OpenItem[];
  resolve(verdictId: string, by: string, at: string): void;
  tracer(runId: string): Tracer;
  trace(runId: string): TraceEvent[];
  saveUpdates(verdictId: string, us: ProposedUpdate[]): void;
  getUpdate(id: string): ProposedUpdate | null;
  pendingUpdates(): ProposedUpdate[];
  approveUpdate(id: string, by: string, at: string): ProposedUpdate;
  declineUpdate(id: string, by: string, at: string): void;
  close(): void;
}

/** Where a project's state lives: `<project>/.bankai/state.db` (gitignored). */
export const storePath = (projectDir: string) => join(projectDir, ".bankai", "state.db");

/** The audit log (append-only JSONL) lives next to the db: `<dir>/audit.jsonl`. */
export function openStore(path: string): Store {
  const db = openDb(path);
  const audit = join(dirname(path), "audit.jsonl");
  return {
    saveVerdict: (v, at) => saveVerdict(db, v, at),
    getVerdict: (id) => getVerdict(db, id),
    openItems: () => openItems(db),
    resolve: (id, by, at) => resolve(db, id, by, at),
    tracer: (runId) => dbTracer(db, runId),
    trace: (runId) => readTrace(db, runId),
    saveUpdates: (vid, us) => saveUpdates(db, vid, us, audit),
    getUpdate: (id) => getUpdate(db, id),
    pendingUpdates: () => pendingUpdates(db),
    approveUpdate: (id, by, at) => approveUpdate(db, id, by, at, audit),
    declineUpdate: (id, by, at) => declineUpdate(db, id, by, at, audit),
    close: () => db.close(),
  };
}
