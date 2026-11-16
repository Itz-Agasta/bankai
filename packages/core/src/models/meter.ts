import type { TraceEvent } from "@bankai/schemas";
import { sha256Hex } from "./hash";
import type { CallCost } from "./types";

export interface Meter {
  record(model: string, ms: number, usd: number): void;
  total(): { models: string[]; cost_usd: number; latency_ms: number };
}

export function memoryMeter(): Meter {
  const calls: CallCost[] = [];
  return {
    record: (model, ms, usd) => void calls.push({ model, ms, usd }),
    total: () => ({
      models: [...new Set(calls.map((c) => c.model))],
      cost_usd: Math.round(calls.reduce((s, c) => s + c.usd, 0) * 1e9) / 1e9,
      latency_ms: calls.reduce((s, c) => s + c.ms, 0),
    }),
  };
}

export interface Tracer {
  step(step: string, input: Uint8Array | string, summary: string, cost?: CallCost): void;
  events(): TraceEvent[];
}

/** In-memory trace (D29); the store-backed tracer arrives with the state store. */
export function memoryTracer(runId: string): Tracer {
  const events: TraceEvent[] = [];
  return {
    step(step, input, summary, cost) {
      events.push({
        id: `${runId}.${events.length}`,
        run_id: runId,
        step,
        input_hash: sha256Hex(input).slice(0, 16),
        summary,
        model: cost?.model ?? null,
        ms: cost?.ms ?? 0,
        usd: cost?.usd ?? 0,
        at: new Date().toISOString(),
      });
    },
    events: () => [...events],
  };
}
