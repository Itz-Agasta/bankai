import { z } from "zod";
import { Citation } from "./citation";
import { Confidence, NonNegative } from "./numbers";

export const CheckName = z.enum([
  "identity",
  "spec",
  "substitution",
  "location",
  "revision",
  "completeness",
  "schedule_impact",
]);
export type CheckName = z.infer<typeof CheckName>;

export const Range = z.object({
  low: z.number(),
  likely: z.number(),
  high: z.number(),
  unit: z.literal("days"),
});
export type Range = z.infer<typeof Range>;

export const Check = z.object({
  name: CheckName,
  result: z.enum(["pass", "fail", "unknown"]),
  reason: z.string(),
  citations: z.array(Citation),
  // Set only by schedule impact (D27).
  range: z.nullable(Range),
});
export type Check = z.infer<typeof Check>;

export const RetakeRequest = z.object({ region: z.string(), why: z.string() });
export type RetakeRequest = z.infer<typeof RetakeRequest>;

export const Status = z.enum(["confirmed", "flagged", "needs_human"]);
export type Status = z.infer<typeof Status>;

export const Verdict = z.object({
  id: z.string(),
  subject_tag: z.nullable(z.string()),
  status: Status,
  checks: z.array(Check),
  confidence: Confidence,
  retake_request: z.nullable(RetakeRequest),
  candidates: z.array(z.string()),
  models: z.array(z.string()),
  cost_usd: NonNegative,
  latency_ms: NonNegative,
});
export type Verdict = z.infer<typeof Verdict>;

export const TraceEvent = z.object({
  id: z.string(),
  run_id: z.string(),
  step: z.string(),
  input_hash: z.string(),
  summary: z.string(),
  model: z.nullable(z.string()),
  ms: NonNegative,
  usd: NonNegative,
  at: z.string(),
});
export type TraceEvent = z.infer<typeof TraceEvent>;
