import { TraceEvent } from "@bankai/schemas";
import type { Database } from "bun:sqlite";
import { traceEvent, type Tracer } from "../models/meter";

/**
 * A tracer that writes each step as it happens, so a crash mid-run still leaves
 * the trail. The sequence number is taken inside the INSERT itself, so several
 * tracers (or processes) on one run never pick the same one.
 */
export function dbTracer(db: Database, runId: string): Tracer {
  const insert = db.query(
    `INSERT INTO trace (id, run_id, seq, json, at)
     SELECT $run || '.' || n, $run, n, $json, $at
     FROM (SELECT COALESCE(MAX(seq) + 1, 0) AS n FROM trace WHERE run_id = $run)`,
  );
  return {
    step(step, input, summary, cost) {
      const e = traceEvent(runId, 0, step, input, summary, cost);
      insert.run({ run: runId, json: JSON.stringify(e), at: e.at });
    },
    events: () => readTrace(db, runId),
  };
}

export function readTrace(db: Database, runId: string): TraceEvent[] {
  const rows = db
    .query(`SELECT id, json FROM trace WHERE run_id = $run ORDER BY seq`)
    .all({ run: runId }) as { id: string; json: string }[];
  // The row id carries the real sequence; the JSON was built before it was assigned.
  return rows.map((r) => TraceEvent.parse({ ...JSON.parse(r.json), id: r.id }));
}
