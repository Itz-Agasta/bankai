import { z } from "zod";

export const CitationKind = z.enum([
  "po_line",
  "submittal",
  "drawing",
  "equipment_schedule_row",
  "schedule_activity",
  "delivery_line",
  "photo_region",
  "audio_span",
]);
export type CitationKind = z.infer<typeof CitationKind>;

export const Citation = z.object({
  kind: CitationKind,
  ref: z.string(),
  quote: z.string().optional(),
});
export type Citation = z.infer<typeof Citation>;

// D31: people appear only as role or device ids, never names.
export const ActorId = z.string().regex(/^[A-Z]{2,5}-\d{1,4}$/);
export type ActorId = z.infer<typeof ActorId>;
