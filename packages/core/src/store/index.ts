import type { TraceEvent, Verdict } from "@bankai/schemas";
import { join } from "node:path";
import type { Tracer } from "../models/meter";
import { openDb } from "./db";
import { dbTracer, readTrace } from "./trace";
import { getVerdict, openItems, resolve, saveVerdict, type OpenItem } from "./verdicts";

export type { OpenItem } from "./verdicts";

/** Memory across days (D28) and the step log (D29) in one SQLite file. */
export interface Store {
  saveVerdict(v: Verdict, at: string): void;
  getVerdict(id: string): Verdict | null;
  openItems(): OpenItem[];
  resolve(verdictId: string, by: string, at: string): void;
  tracer(runId: string): Tracer;
  trace(runId: string): TraceEvent[];
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
    close: () => db.close(),
  };
}
