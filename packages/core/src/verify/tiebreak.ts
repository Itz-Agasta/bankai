import type { Link, Observation } from "@bankai/schemas";
import { AMBIGUOUS_MARGIN, MIN_LINK_SCORE, rankCandidates, type Candidate } from "../link";
import { resolveTie, tieQuestions } from "../link/tiebreak";
import type { Meter, Tracer } from "../models/meter";
import type { Fields, VisionModel } from "../models/types";
import type { Perception } from "../perceive";
import type { Project } from "../project/types";

export interface TieBreak {
  tag: string;
  link: Link;
  observations: Observation[];
}

/**
 * Units that tie on the plate but differ in a printed field: both model families re-read only
 * that field, choosing among the candidates' values. Only a value both agree on counts, and only
 * one candidate fitting every agreed value gets linked. Any failure leaves the tie to a person.
 */
export async function breakTie(
  candidates: Candidate[],
  perception: Perception,
  models: { primary: VisionModel; checker: VisionModel },
  project: Project,
  meter: Meter,
  tracer: Tracer,
): Promise<TieBreak | null> {
  const top = candidates[0]?.score ?? 0;
  const tied = candidates.filter((c) => c.method !== "exact" && c.score >= top - AMBIGUOUS_MARGIN);
  const crop = perception.crops[0];
  const { primary, checker } = models;
  if (tied.length < 2 || !crop || !primary.choose || !checker.choose) return null;
  const questions = tieQuestions(tied, project);
  if (questions.length === 0) return null; // identical twins: only the painted tag can tell
  let a: Fields, b: Fields;
  try {
    const [p, c] = await Promise.all([
      primary.choose(crop.img, questions),
      checker.choose(crop.img, questions),
    ]);
    for (const [step, r] of [
      ["tiebreak.primary", p],
      ["tiebreak.checker", c],
    ] as const) {
      meter.record(r.cost.model, r.cost.ms, r.cost.usd);
      tracer.step(step, crop.img, JSON.stringify(r.value), r.cost);
    }
    [a, b] = [p.value, c.value];
  } catch (e) {
    tracer.step("tiebreak", crop.img, `unavailable: ${(e as Error).message}`);
    return null;
  }
  const agreed: Fields = {};
  for (const q of questions) {
    const v = a[q.field];
    if (v !== undefined && v === b[q.field] && q.options.includes(v)) agreed[q.field] = v;
  }
  const winner = resolveTie(tied, agreed, project);
  if (!winner) return null;

  const evidence = { kind: "photo_region", ref: crop.region } as const;
  const observations = [
    ...perception.observations.filter((o) => !(o.field in agreed)),
    ...Object.entries(agreed).map(([field, value]) => ({
      id: `tb.${field}`,
      source: "photo" as const,
      field: field as Observation["field"],
      value,
      model_votes: { primary: value, checker: value },
      evidence,
    })),
  ];
  const best = rankCandidates(observations, project).find((c) => c.tag === winner);
  if (!best || best.score < MIN_LINK_SCORE) return null;
  // No other candidate fits what both models read, so the gap is to "nobody else".
  const link: Link = {
    observation_ids: best.observation_ids,
    record: best.record,
    method: "llm_tiebreak",
    score: best.score,
    margin: best.score,
  };
  return { tag: winner, link, observations };
}
