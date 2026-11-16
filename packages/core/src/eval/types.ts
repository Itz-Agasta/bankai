import type { Field, Scenario, ScenarioKind, Verdict } from "@bankai/schemas";
import type { VisionModel } from "../models/types";

export type Models = { primary: VisionModel; checker: VisionModel };
/** Models for one case, given its photos (live runs return the same pair; fakes script per photo). */
export type ModelsFor = (photos: string[]) => Models;

export interface CaseResult {
  id: string;
  kind: ScenarioKind;
  expected: Scenario["expected"];
  actual: Verdict;
  correct: boolean;
  fabricated: boolean;
}

export interface FieldResult {
  photo: string;
  field: Field;
  expected: string;
  actual: string | null;
  correct: boolean;
}

export interface EvalResult {
  cases: CaseResult[];
  fields: FieldResult[];
  /** null when there was nothing to measure (no labels, no answered cases). */
  fieldAccuracy: number | null;
  verdictAccuracy: number | null;
  selectiveAccuracy: number | null;
  coverage: number | null;
  fabricated: number;
  costUsd: number;
  meanLatencyMs: number;
  models: string[];
  noCrop: boolean;
}
