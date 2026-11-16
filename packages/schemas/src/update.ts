import { z } from "zod";
import { ActorId, Citation } from "./citation";
import { Confidence, NonNegative } from "./numbers";
import { Status, Verdict } from "./verdict";

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
