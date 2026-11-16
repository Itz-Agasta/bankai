import type { Check } from "@bankai/schemas";
import { completeness } from "./completeness";
import { check, type RuleContext } from "./context";
import { identity } from "./identity";
import { location } from "./location";
import { revision } from "./revision";
import { spec } from "./spec";
import { substitution } from "./substitution";

const DEPENDENT = [
  ["spec", spec],
  ["substitution", substitution],
  ["location", location],
  ["revision", revision],
  ["completeness", completeness],
] as const;

/** Identity gates the rest: no confirmed unit, nothing else can be judged. */
export function runRules(ctx: RuleContext): Check[] {
  const id = identity(ctx);
  if (id.result !== "pass")
    return [id, ...DEPENDENT.map(([name]) => check(name, "unknown", "no_identity"))];
  return [id, ...DEPENDENT.map(([, rule]) => rule(ctx))];
}

export type { RuleContext } from "./context";
