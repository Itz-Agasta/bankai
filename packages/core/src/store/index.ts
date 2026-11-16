import type { NoteResult, ProposedUpdate, TraceEvent, Verdict } from "@bankai/schemas";
import { dirname, join } from "node:path";
import type { Tracer } from "../models/meter";
import { openDb } from "./db";
import { getNote, saveNote } from "./notes";
import { dbTracer, readTrace } from "./trace";
import {
  approveUpdate,
  declineUpdate,
  rejectUpdate,
  getUpdate,
  pendingUpdates,
  saveUpdates,
  verdictOfUpdate,
} from "./updates";
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
  /** A tracer for a run id used before (a re-processed note): the old trail is cleared first. */
  restartTrace(runId: string): Tracer;
  trace(runId: string): TraceEvent[];
  /** Saves the note and its proposals together; see store/notes.ts for re-run rules. */
  saveNote(n: NoteResult, at: string): void;
  getNote(id: string): NoteResult | null;
  /** `sourceId` is the verdict or note that proposed the updates. */
  saveUpdates(sourceId: string, us: ProposedUpdate[]): void;
  getUpdate(id: string): ProposedUpdate | null;
  /** The verdict or note that proposed this update. */
  verdictOfUpdate(id: string): string | null;
  pendingUpdates(): ProposedUpdate[];
  approveUpdate(id: string, by: string, at: string): ProposedUpdate;
  declineUpdate(id: string, by: string, at: string): void;
  rejectUpdate(id: string, by: string, at: string): ProposedUpdate;
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
    restartTrace: (runId) => {
      db.query(`DELETE FROM trace WHERE run_id = $run`).run({ run: runId });
      return dbTracer(db, runId);
    },
    trace: (runId) => readTrace(db, runId),
    saveNote: (n, at) => saveNote(db, n, at, audit),
    getNote: (id) => getNote(db, id),
    saveUpdates: (vid, us) => saveUpdates(db, vid, us, audit),
    getUpdate: (id) => getUpdate(db, id),
    verdictOfUpdate: (id) => verdictOfUpdate(db, id),
    pendingUpdates: () => pendingUpdates(db),
    approveUpdate: (id, by, at) => approveUpdate(db, id, by, at, audit),
    declineUpdate: (id, by, at) => declineUpdate(db, id, by, at, audit),
    rejectUpdate: (id, by, at) => rejectUpdate(db, id, by, at, audit),
    close: () => db.close(),
  };
}
