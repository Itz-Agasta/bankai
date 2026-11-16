import type { Field, Observation } from "@bankai/schemas";
import { normalizeTag } from "./link/normalize";

const canon = (v: string) => v.toUpperCase().replace(/\s+/g, "");

/**
 * The agreed reading of a field. Undefined when it was not read, or when two
 * readings disagree: an arbitrary pick would be a guess.
 */
export function reading(observations: Observation[], field: Field): Observation | undefined {
  const all = observations.filter((o) => o.field === field);
  if (all.length === 0) return undefined;
  const key = field === "tag" ? normalizeTag : canon;
  return all.every((o) => key(o.value) === key(all[0]!.value)) ? all[0] : undefined;
}

/** First number in a rating: "415/240V" gives 415, "11kV" gives 11000, "1800 kVA" gives 1800. */
export function firstNumber(raw: string): number | null {
  // k is a multiplier only in kV; in kVA and kW it is part of the unit.
  const m = /(\d+(?:\.\d+)?)\s*(k(?=v(?!a)))?/i.exec(raw);
  if (!m) return null;
  return Number(m[1]) * (m[2] ? 1000 : 1);
}
