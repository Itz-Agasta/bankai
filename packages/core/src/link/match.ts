import type { Citation, Field, Link, Observation } from "@bankai/schemas";
import { cite } from "../cite";
import type { Project } from "../project/types";
import { normalizeTag } from "./normalize";
import { ocrDistance } from "./ocr-distance";

export interface Candidate {
  tag: string;
  score: number;
  method: Link["method"];
  record: Citation;
  /** Observations that contributed to the score. */
  observation_ids: string[];
}

export const AMBIGUOUS_MARGIN = 0.15;
export const MIN_LINK_SCORE = 0.6;

interface Target {
  tag: string;
  manufacturer: string;
  model: string;
  voltage: string;
  kva: number | null;
  kw: number | null;
  record: Citation;
}

/** Current schedule rows, plus tags that exist only on a PO line. */
function records(project: Project): Target[] {
  const out: Target[] = [...project.byTag.values()].map((r) => ({
    ...r,
    record: cite.equipmentRow(r.tag),
  }));
  for (const l of project.poLines) {
    if (project.byTag.has(l.tag)) continue;
    out.push({ ...l, record: cite.poLine(l) });
  }
  return out;
}

const number = (s: string) => Number.parseFloat(s.replace(/[^\d.]/g, ""));
const sameNumber = (observed: string, expected: string | number | null) =>
  expected !== null &&
  Number.isFinite(number(observed)) &&
  number(observed) === number(String(expected));

function score(rec: Target, seen: Map<Field, Observation>): Candidate {
  const tag = seen.get("tag");
  if (tag && normalizeTag(tag.value) === rec.tag) {
    return {
      tag: rec.tag,
      score: 1,
      method: "exact",
      record: rec.record,
      observation_ids: [tag.id],
    };
  }
  let s = 0;
  let method: Link["method"] = "fuzzy";
  const ids: string[] = [];
  const maker = seen.get("manufacturer");
  if (maker && maker.value.trim().toUpperCase() === rec.manufacturer.toUpperCase()) {
    s += 0.25;
    ids.push(maker.id);
  }
  const model = seen.get("model");
  if (model) {
    const d = ocrDistance(model.value, rec.model);
    if (d < 1) {
      s += (1 - d) * 0.45;
      ids.push(model.id);
      if (d === 0) method = "normalized";
    }
  }
  let ratings = 0;
  for (const [field, expected] of [
    ["voltage", rec.voltage],
    ["kva", rec.kva],
    ["kw", rec.kw],
  ] as const) {
    const o = seen.get(field);
    if (o && sameNumber(o.value, expected)) {
      ratings += 0.1;
      ids.push(o.id);
    }
  }
  s += Math.min(ratings, 0.3);
  return {
    tag: rec.tag,
    score: Math.round(s * 1e9) / 1e9,
    method,
    record: rec.record,
    observation_ids: ids,
  };
}

/** Candidates with any evidence, best first. */
export function rankCandidates(obs: Observation[], project: Project): Candidate[] {
  const seen = new Map<Field, Observation>();
  for (const o of obs) if (!seen.has(o.field)) seen.set(o.field, o);
  return records(project)
    .map((r) => score(r, seen))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));
}

/** Link only a clear winner: score >= 0.6 and at least 0.15 ahead of the runner-up. */
export function linkObservations(
  obs: Observation[],
  project: Project,
): { links: Link[]; candidates: Candidate[]; ambiguous: boolean } {
  const candidates = rankCandidates(obs, project);
  const [top, next] = candidates;
  if (!top) return { links: [], candidates, ambiguous: false };
  const margin = Math.round((top.score - (next?.score ?? 0)) * 1e9) / 1e9;
  const ambiguous = margin < AMBIGUOUS_MARGIN;
  const links: Link[] =
    !ambiguous && top.score >= MIN_LINK_SCORE
      ? [
          {
            observation_ids: top.observation_ids,
            record: top.record,
            method: top.method,
            score: top.score,
            margin,
          },
        ]
      : [];
  return { links, candidates, ambiguous };
}
