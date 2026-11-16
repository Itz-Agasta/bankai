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

const clean = (v: string | undefined | null) =>
  v && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : null;

function agree(field: Field, a: string, b: string): boolean {
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
export function mergeReadings(primary: Fields, checker: Fields): MergedField[] {
  const out: MergedField[] = [];
  for (const field of FIELDS) {
    const p = clean(primary[field]);
    const c = clean(checker[field]);
    const value = p && c ? (agree(field, p, c) ? p : null) : (p ?? c);
    if (value && validateField(field, value))
      out.push({ field, value, votes: { primary: p, checker: c } });
  }
  return out;
}
