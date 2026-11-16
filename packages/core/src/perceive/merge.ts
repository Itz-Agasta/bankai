import type { Field } from "@bankai/schemas";
import type { Fields } from "../models/types";
import { firstNumber } from "../readings";
import { validateField } from "./validators";

const RATINGS = new Set<Field>(["voltage", "kva", "kw", "phase", "frequency"]);
const FIELDS: Field[] = [
  "manufacturer",
  "model",
  "serial",
  "tag",
  "voltage",
  "kva",
  "kw",
  "phase",
  "frequency",
];

const SENTINELS = new Set(["null", "none", "n/a", "na", "unknown", "unreadable", "illegible", "-"]);

/** A reading, or null for empty text, punctuation only, or a placeholder word. */
const clean = (v: string | undefined | null) => {
  const t = v?.trim() ?? "";
  return t && /[a-z0-9]/i.test(t) && !SENTINELS.has(t.toLowerCase()) ? t : null;
};

const numbers = (s: string) => s.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];

function agree(field: Field, a: string, b: string): boolean {
  // A dual voltage like 415/240 must match on every number, not just the first.
  if (field === "voltage")
    return numbers(a).length > 0 && numbers(a).join("/") === numbers(b).join("/");
  if (RATINGS.has(field)) return firstNumber(a) !== null && firstNumber(a) === firstNumber(b);
  const canon = (s: string) => s.toUpperCase().replace(/[\s\-/.]+/g, "");
  return canon(a) === canon(b);
}

export interface MergedField {
  field: Field;
  value: string;
  votes: { primary: string | null; checker: string | null };
}

/**
 * Two readings in, trusted fields out: agreement keeps the value, a lone reading
 * survives only if plausible, disagreement or an implausible value drops it.
 */
export function mergeReadings(
  primary: Fields,
  checker: Fields,
): { kept: MergedField[]; dropped: Field[] } {
  const out: MergedField[] = [];
  const dropped: Field[] = [];
  for (const field of FIELDS) {
    const rawP = clean(primary[field]);
    const rawC = clean(checker[field]);
    // An implausible vote is no vote: "-50" must not count as agreeing with "50".
    const p = rawP && validateField(field, rawP) ? rawP : null;
    const c = rawC && validateField(field, rawC) ? rawC : null;
    const value = p && c ? (agree(field, p, c) ? p : null) : (p ?? c);
    if (value) out.push({ field, value, votes: { primary: p, checker: c } });
    else if (rawP || rawC) dropped.push(field);
  }
  return { kept: out, dropped };
}
