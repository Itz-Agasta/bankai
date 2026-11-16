import type { Field } from "@bankai/schemas";
import type { Fields, TieQuestion } from "../models/types";
import type { Project } from "../project/types";
import { records, sameNumber, type Candidate, type Target } from "./match";
import { ocrDistance } from "./ocr-distance";

const FIELDS = ["manufacturer", "model", "voltage", "kva", "kw"] as const satisfies Field[];
type TieField = (typeof FIELDS)[number];

const valueOf = (t: Target, f: TieField) => (t[f] === null ? null : String(t[f]));
const canon = (v: string) => v.toUpperCase().replace(/\s+/g, "");

function fits(t: Target, f: TieField, answer: string): boolean {
  const v = valueOf(t, f);
  if (v === null) return false;
  if (f === "model") return ocrDistance(answer, v) === 0;
  if (f === "manufacturer") return canon(answer) === canon(v);
  return sameNumber(answer, v);
}

const targetsOf = (cands: Candidate[], p: Project) => {
  const all = records(p);
  return cands.flatMap((c) => all.filter((t) => t.tag === c.tag));
};

/**
 * Fields the tied candidates disagree on, with each candidate's value as an option. Identical
 * twins give nothing to ask: only the painted tag tells them apart.
 */
export function tieQuestions(cands: Candidate[], p: Project): TieQuestion[] {
  const targets = targetsOf(cands, p);
  if (targets.length < 2) return [];
  return FIELDS.flatMap((field) => {
    const options = [...new Set(targets.map((t) => valueOf(t, field)))];
    // Every candidate must hold a value, or "not printed" could not be told from "the other one".
    if (options.length < 2 || options.includes(null)) return [];
    return [{ field, options: (options as string[]).sort() }];
  });
}

/** The one tied candidate that fits every answer both models agreed on, else null. */
export function resolveTie(cands: Candidate[], agreed: Fields, p: Project): string | null {
  const answers = Object.entries(agreed).filter(([f]) =>
    (FIELDS as readonly string[]).includes(f),
  ) as [TieField, string][];
  if (answers.length === 0) return null;
  const left = targetsOf(cands, p).filter((t) => answers.every(([f, v]) => fits(t, f, v)));
  return left.length === 1 ? left[0]!.tag : null;
}
