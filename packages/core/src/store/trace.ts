import { TraceEvent } from "@bankai/schemas";
import type { Database } from "bun:sqlite";
import { traceEvent, type Tracer } from "../models/meter";

/** A tracer that writes each step as it happens, so a crash mid-run still leaves the trail. */
export function dbTracer(db: Database, runId: string): Tracer {
  const insert = db.query(
    `INSERT INTO trace (id, run_id, seq, json, at) VALUES ($id, $run, $seq, $json, $at)`,
  );
  let seq = (
    db.query(`SELECT COUNT(*) AS n FROM trace WHERE run_id = $run`).get({ run: runId }) as {
      n: number;
    }
  ).n;
  return {
    step(step, input, summary, cost) {
      const e = traceEvent(runId, seq, step, input, summary, cost);
      insert.run({ id: e.id, run: runId, seq, json: JSON.stringify(e), at: e.at });
      seq++;
    },
    events: () => readTrace(db, runId),
  };
}

export function readTrace(db: Database, runId: string): TraceEvent[] {
  const rows = db
    .query(`SELECT json FROM trace WHERE run_id = $run ORDER BY seq`)
    .all({ run: runId }) as {
    json: string;
  }[];
  return rows.map((r) => TraceEvent.parse(JSON.parse(r.json)));
}
