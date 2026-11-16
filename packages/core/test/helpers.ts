import type { Field, Observation } from "@bankai/schemas";
import { join } from "node:path";
import { loadProject } from "../src/project/load";

export const loadMini = () => loadProject(join(import.meta.dir, "../../../data/fixtures/mini"));

/** One photo observation per field, ids o0, o1, ... in key order. */
export function obs(fields: Partial<Record<Field, string>>): Observation[] {
  return Object.entries(fields).map(([field, value], i) => ({
    id: `o${i}`,
    source: "photo",
    field: field as Field,
    value,
    model_votes: { primary: value, checker: value },
    evidence: { kind: "photo_region", ref: `p1#${field}` },
  }));
}
