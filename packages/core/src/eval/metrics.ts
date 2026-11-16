import type { Field, Scenario, Verdict } from "@bankai/schemas";
import type { Project } from "../project/types";
import { normalizeModel, normalizeTag } from "../link/normalize";
import { firstNumber, numbersIn } from "../readings";
import type { CaseResult, EvalResult, FieldResult } from "./types";

const RATINGS = new Set<Field>(["voltage", "kva", "kw", "phase", "frequency"]);
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Status, unit and the set of failing checks must all match (and candidates, when the scenario lists them). */
export function caseCorrect(expected: Scenario["expected"], v: Verdict): boolean {
  const failing = v.checks.filter((c) => c.result === "fail").map((c) => c.name);
  return (
    v.status === expected.status &&
    v.subject_tag === expected.subject_tag &&
    sameSet(failing, expected.failing_checks) &&
    (expected.candidates === undefined || sameSet(v.candidates, expected.candidates))
  );
}

/** An answered case naming a unit the project does not have, or any unit for a not-in-project scenario. */
export function caseFabricated(s: Scenario, v: Verdict, project: Project): boolean {
  if (s.kind === "not_in_project" && v.subject_tag !== null) return true;
  if (v.status === "needs_human" || v.subject_tag === null) return false;
  return !project.byTag.has(v.subject_tag) && !project.poByTag.has(v.subject_tag);
}

/** Exact match after normalizing case and spacing; ratings compare every number ("415/240"). */
export function fieldMatches(field: Field, expected: string, actual: string | null): boolean {
  // An "unreadable" label is answered right only by abstaining; any value there is invented.
  if (expected === "unreadable") return actual === null;
  if (actual === null) return false;
  if (RATINGS.has(field)) {
    const nums = (s: string) => numbersIn(s).join("/");
    return firstNumber(actual) !== null && nums(actual) === nums(expected);
  }
  // Same normalization the linker uses, so a reading it accepts is not scored wrong.
  const norm = field === "tag" ? normalizeTag : normalizeModel;
  return norm(actual) === norm(expected);
}

/** Nothing to measure is "not measured", never a measured 0%. */
const ratio = (n: number, d: number) => (d === 0 ? null : n / d);

export function summarize(
  cases: CaseResult[],
  fields: FieldResult[],
  extra: { costUsd: number; models: string[]; noCrop: boolean },
): EvalResult {
  const covered = cases.filter((c) => c.actual.status !== "needs_human");
  return {
    cases,
    fields,
    fieldAccuracy: ratio(fields.filter((f) => f.correct).length, fields.length),
    verdictAccuracy: ratio(cases.filter((c) => c.correct).length, cases.length),
    selectiveAccuracy: ratio(covered.filter((c) => c.correct).length, covered.length),
    coverage: ratio(covered.length, cases.length),
    fabricated: cases.filter((c) => c.fabricated).length,
    costUsd: Math.round(extra.costUsd * 1e6) / 1e6,
    meanLatencyMs: Math.round(
      ratio(
        cases.reduce((s, c) => s + c.actual.latency_ms, 0),
        cases.length,
      ) ?? 0,
    ),
    models: extra.models,
    noCrop: extra.noCrop,
  };
}
