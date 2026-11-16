import { z } from "zod";
import { ActorId, Citation } from "./citation";
import { Confidence, NonNegative } from "./numbers";
import { Check, Status, Verdict } from "./verdict";

export const ProposedUpdate = z.object({
  id: z.string(),
  target: Citation,
  field: z.string(),
  old: z.string(),
  new: z.string(),
  evidence: z.array(Citation),
  confidence: Confidence,
  approval: z.enum(["pending", "approved", "rejected"]),
  approved_by: z.nullable(ActorId),
  at: z.nullable(z.string()),
});
export type ProposedUpdate = z.infer<typeof ProposedUpdate>;

export const VerifyResult = z.object({
  verdict: Verdict,
  proposed_updates: z.array(ProposedUpdate),
});
export type VerifyResult = z.infer<typeof VerifyResult>;

export const ClaimType = z.enum(["status", "date_change", "issue", "decision", "action_item"]);
export type ClaimType = z.infer<typeof ClaimType>;

export const Claim = z.object({
  id: z.string(),
  type: ClaimType,
  text: z.string(),
  span: Citation.extend({ kind: z.literal("audio_span") }),
  links: z.array(Citation),
  /** Rule checks run on this claim; a failing one says why the note was flagged. */
  checks: z.array(Check),
  confidence: Confidence,
});
export type Claim = z.infer<typeof Claim>;

export const NoteResult = z.object({
  id: z.string(),
  claims: z.array(Claim),
  updates: z.array(ProposedUpdate),
  status: Status,
  confidence: Confidence,
  models: z.array(z.string()),
  cost_usd: NonNegative,
  latency_ms: NonNegative,
});
export type NoteResult = z.infer<typeof NoteResult>;

/** One transcript word with its time in the audio, in seconds. */
export const Word = z.object({
  i: z.number().int().nonnegative(),
  text: z.string(),
  start: NonNegative,
  end: NonNegative,
});
export type Word = z.infer<typeof Word>;

/** A claim the model returned that the transcript did not support. */
export const DroppedClaim = z.object({
  word_start: z.number().int(),
  word_end: z.number().int(),
  type: ClaimType,
  reason: z.string(),
});
export type DroppedClaim = z.infer<typeof DroppedClaim>;

export const NoteRun = z.object({
  result: NoteResult,
  transcript: z.array(Word),
  dropped: z.array(DroppedClaim),
});
export type NoteRun = z.infer<typeof NoteRun>;
