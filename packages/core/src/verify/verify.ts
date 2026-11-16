import type { Check, Field, Observation, Verdict } from "@bankai/schemas";
import calibrator from "../../calibrator.json";
import { AMBIGUOUS_MARGIN, linkObservations } from "../link";
import { memoryMeter, type Tracer } from "../models/meter";
import type { VisionModel } from "../models/types";
import { perceivePhoto } from "../perceive";
import type { Project } from "../project/types";
import { runRules } from "../rules";
import { confidence } from "./confidence";
import { citeOrDrop, dropUncited } from "./drop-uncited";
import { decideStatus } from "./status";

export interface VerifyInput {
  photos: string[];
  location: string | null;
  observedComponents?: string[];
  /** Read the whole photo instead of the nameplate crop (spot-check comparison). */
  noCrop?: boolean;
}

export interface VerifyDeps {
  project: Project;
  models: { primary: VisionModel; checker: VisionModel };
  tracer: Tracer;
  /** Verdict id; pass the same id the tracer was opened with so the trail and verdict line up. */
  runId?: string;
}

const DEPENDENT: Check["name"][] = ["spec", "substitution", "location", "revision", "completeness"];
const unknown = (name: Check["name"], reason: string): Check => ({
  name,
  result: "unknown",
  reason,
  citations: [],
  range: null,
});

/** Share of nameplate fields both models agreed on, counting dropped ones. Tags are judged by linking. */
function agreementRate(obs: Observation[], dropped: Field[]): number {
  const read = obs.filter((o) => o.field !== "tag");
  const agreed = read.filter(
    (o) => o.model_votes.primary !== null && o.model_votes.checker !== null,
  ).length;
  const total = read.length + dropped.length;
  return total === 0 ? 0 : agreed / total;
}

/** Share of the ratings the records hold for this unit that the photo actually showed. */
function ratingCoverage(project: Project, tag: string | null, obs: Observation[]): number {
  if (!tag) return 0;
  const po = project.poByTag.get(tag);
  const row = project.byTag.get(tag);
  const expected: Field[] = [];
  if (po?.voltage || row?.voltage) expected.push("voltage");
  if (po?.kva != null || row?.kva != null) expected.push("kva");
  if (po?.kw != null || row?.kw != null) expected.push("kw");
  if (row) expected.push("phase", "frequency");
  if (expected.length === 0) return 1;
  return expected.filter((f) => obs.some((o) => o.field === f)).length / expected.length;
}

/** Photos in, cited verdict out. Models perceive, rules decide, the threshold says when to ask a human. */
export async function verifyEquipment(input: VerifyInput, deps: VerifyDeps): Promise<Verdict> {
  const { project, models, tracer } = deps;
  const meter = memoryMeter();
  const runId = deps.runId ?? crypto.randomUUID();
  const perception = await perceivePhoto(input.photos, models, meter, tracer, {
    noCrop: input.noCrop,
  });

  const done = (v: Omit<Verdict, "id" | "models" | "cost_usd" | "latency_ms">): Verdict => {
    const verdict = dropUncited({ id: runId, ...v, ...meter.total() });
    tracer.step("decide", runId, `${verdict.status} ${verdict.confidence}`);
    return verdict;
  };

  if (perception.noNameplate) {
    tracer.step("link", runId, "skipped: no nameplate");
    tracer.step("rules", runId, "skipped: no nameplate");
    return done({
      subject_tag: null,
      status: "needs_human",
      checks: [
        unknown("identity", "no_nameplate_found"),
        ...DEPENDENT.map((n) => unknown(n, "no_identity")),
      ],
      confidence: 0,
      retake_request: { region: "nameplate", why: "no nameplate found" },
      candidates: [],
    });
  }

  const linked = linkObservations(perception.observations, project);
  const link = linked.links[0];
  const tag = link ? (linked.candidates[0]?.tag ?? null) : null;
  const top = linked.candidates[0]?.score ?? 0;
  const candidates = linked.ambiguous
    ? linked.candidates.filter((c) => c.score >= top - AMBIGUOUS_MARGIN).map((c) => c.tag)
    : [];
  tracer.step(
    "link",
    runId,
    link ? `${tag} ${link.method} ${link.score}` : `none (${linked.candidates.length} candidates)`,
  );

  const checks = citeOrDrop(
    runRules({
      project,
      tag,
      observations: perception.observations,
      location: input.location,
      observedComponents: input.observedComponents ?? [],
    }),
  );
  tracer.step("rules", runId, checks.map((c) => `${c.name}:${c.result}`).join(" "));

  const conf = confidence({
    agreementRate: agreementRate(perception.observations, perception.dropped),
    linkScore: link?.score ?? 0,
    margin: link?.margin ?? 0,
    ratingCoverage: ratingCoverage(project, tag, perception.observations),
  });
  return done({
    subject_tag: tag,
    status: decideStatus(checks, conf, calibrator.threshold),
    checks,
    confidence: conf,
    // Identical units: the plate alone cannot tell them apart, the painted tag can.
    retake_request:
      perception.retake ??
      (candidates.length > 1
        ? {
            region: "equipment tag",
            why: `matches ${candidates.join(", ")}; photograph the painted tag`,
          }
        : null),
    candidates,
  });
}
