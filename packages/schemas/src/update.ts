import { z } from "zod";
import { ActorId, Citation } from "./citation";
import { Status } from "./verdict";

export const ProposedUpdate = z.object({
  id: z.string(),
  target: Citation,
  field: z.string(),
  old: z.string(),
  new: z.string(),
  evidence: z.array(Citation),
  confidence: z.number(),
  approval: z.enum(["pending", "approved", "rejected"]),
  approved_by: z.nullable(ActorId),
  at: z.nullable(z.string()),
});
export type ProposedUpdate = z.infer<typeof ProposedUpdate>;

export const ClaimType = z.enum(["status", "date_change", "issue", "decision", "action_item"]);
export type ClaimType = z.infer<typeof ClaimType>;

export const Claim = z.object({
  id: z.string(),
  type: ClaimType,
  text: z.string(),
  span: Citation,
  links: z.array(Citation),
  confidence: z.number(),
});
export type Claim = z.infer<typeof Claim>;

export const NoteResult = z.object({
  id: z.string(),
  claims: z.array(Claim),
  updates: z.array(ProposedUpdate),
  status: Status,
  confidence: z.number(),
  models: z.array(z.string()),
  cost_usd: z.number(),
  latency_ms: z.number(),
});
export type NoteResult = z.infer<typeof NoteResult>;
