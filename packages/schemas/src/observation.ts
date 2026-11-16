import { z } from "zod";
import { Citation } from "./citation";

export const Field = z.enum([
  "manufacturer",
  "model",
  "serial",
  "tag",
  "voltage",
  "kva",
  "kw",
  "phase",
  "frequency",
]);
export type Field = z.infer<typeof Field>;

export const Observation = z.object({
  id: z.string(),
  source: z.enum(["photo", "audio"]),
  field: Field,
  value: z.string(),
  model_votes: z.object({ primary: z.nullable(z.string()), checker: z.nullable(z.string()) }),
  evidence: Citation,
});
export type Observation = z.infer<typeof Observation>;

export const Link = z.object({
  observation_ids: z.array(z.string()).min(1),
  record: Citation,
  method: z.enum(["exact", "normalized", "fuzzy", "llm_tiebreak"]),
  score: z.number(),
  margin: z.number(),
});
export type Link = z.infer<typeof Link>;
