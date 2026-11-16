import { z } from "zod";
import { Field } from "./observation";
import { ClaimType } from "./update";
import { CheckName, Status } from "./verdict";

/** Ground truth for one photo: each field exactly as printed, or "unreadable". */
export const PhotoLabel = z.object({
  photo: z.string().min(1),
  equipment_type: z.string().min(1),
  fields: z.partialRecord(Field, z.string().min(1)),
  hard: z.boolean(),
  people_checked: z.literal(true),
});
export type PhotoLabel = z.infer<typeof PhotoLabel>;

export const ScenarioKind = z.enum([
  "correct",
  "wrong_location",
  "superseded_revision",
  "spec_mismatch",
  "partial_shipment",
  "unapproved_substitution",
  "unreadable",
  "not_in_project",
]);
export type ScenarioKind = z.infer<typeof ScenarioKind>;

export const Scenario = z.object({
  id: z.string().min(1),
  project: z.string().min(1),
  photos: z.array(z.string().min(1)).min(1),
  location: z.nullable(z.string().min(1)),
  expected: z.object({
    status: Status,
    subject_tag: z.nullable(z.string().min(1)),
    failing_checks: z.array(CheckName),
    candidates: z.array(z.string().min(1)).optional(),
  }),
  kind: ScenarioKind,
});
export type Scenario = z.infer<typeof Scenario>;

/** One voice exam question: a walk note and the claims a careful listener would record. */
export const NoteScenario = z.object({
  id: z.string().min(1),
  project: z.string().min(1),
  audio: z.string().min(1),
  expected: z.object({
    status: Status,
    claims: z.array(
      z.object({
        type: ClaimType,
        tag: z.string().min(1).optional(),
        activity: z.string().min(1).optional(),
        /** Text the proposal (or, without one, the claim) must contain. */
        value: z.string().min(1).optional(),
      }),
    ),
  }),
});
export type NoteScenario = z.infer<typeof NoteScenario>;
