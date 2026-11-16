import type { Field, Observation, RetakeRequest } from "@bankai/schemas";
import { basename } from "node:path";
import type { Meter, Tracer } from "../models/meter";
import type { VisionModel } from "../models/types";
import { cropPadded, loadImage } from "./image";
import { BankaiFailure } from "../errors";
import { normalizeTag } from "../link/normalize";
import { mergeReadings } from "./merge";

export { loadImage } from "./image";
export { validateField } from "./validators";

const REQUIRED: Field[] = ["manufacturer", "model"];

/** Any model failure (outage, timeout, bad key) surfaces as PERCEPTION_UNAVAILABLE. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof BankaiFailure) throw e;
    throw new BankaiFailure(
      "PERCEPTION_UNAVAILABLE",
      "vision model call failed",
      (e as Error).message,
    );
  }
}

/** One observation per distinct tag: "GEN 3" and "GEN-3" are the same tag, blanks are none. */
function uniqueTags(raw: string[]): string[] {
  const seen = new Map<string, string>();
  for (const t of raw.map((r) => r.trim()).filter((r) => r.length > 0)) {
    if (!seen.has(normalizeTag(t))) seen.set(normalizeTag(t), t);
  }
  return [...seen.values()];
}

export interface Perception {
  observations: Observation[];
  retake: RetakeRequest | null;
  noNameplate: boolean;
  /** Fields a model read that were discarded (disagreement or implausible), for confidence. */
  dropped: Field[];
}

/** Locate, crop, read with two model families, merge. The models perceive; nothing here decides. */
export async function perceivePhoto(
  paths: string[],
  models: { primary: VisionModel; checker: VisionModel },
  meter: Meter,
  tracer: Tracer,
): Promise<Perception> {
  const observations: Observation[] = [];
  let anything = false;
  const dropped: Field[] = [];

  for (const [i, path] of paths.entries()) {
    const img = await loadImage(path);
    const file = basename(path);
    const located = await call(() => models.primary.locate(img));
    meter.record(located.cost.model, located.cost.ms, located.cost.usd);
    const { plate } = located.value;
    const tags = uniqueTags(located.value.tags);
    tracer.step("locate", img, `plate=${plate ? "yes" : "no"} tags=${tags.length}`, located.cost);
    if (!plate && tags.length === 0) continue;
    anything = true;

    const region = plate
      ? `${file}#bbox(${plate.x},${plate.y},${plate.w},${plate.h})`
      : `${file}#full`;
    const evidence = { kind: "photo_region", ref: region } as const;
    for (const [j, tag] of tags.entries()) {
      observations.push({
        id: `p${i}.tag${j}`,
        source: "photo",
        field: "tag",
        value: tag,
        model_votes: { primary: tag, checker: null },
        evidence,
      });
    }
    if (!plate) continue;

    const crop = await cropPadded(img, plate);
    const [p, c] = await Promise.all([
      call(() => models.primary.read(crop)),
      call(() => models.checker.read(crop)),
    ]);
    for (const [step, r] of [
      ["read.primary", p],
      ["read.checker", c],
    ] as const) {
      meter.record(r.cost.model, r.cost.ms, r.cost.usd);
      tracer.step(step, crop, `${Object.keys(r.value).length} fields`, r.cost);
    }
    const { kept: merged, dropped: lost } = mergeReadings(p.value, c.value);
    dropped.push(...lost.filter((f) => f !== "tag")); // tags are judged by linking, not agreement
    tracer.step("merge", crop, merged.map((m) => m.field).join(",") || "none");
    for (const m of merged) {
      observations.push({
        id: `p${i}.${m.field}`,
        source: "photo",
        field: m.field,
        value: m.value,
        model_votes: m.votes,
        evidence,
      });
    }
  }

  const missing = REQUIRED.filter((f) => !observations.some((o) => o.field === f));
  const retake =
    // A tag with no readable plate still needs the plate photographed.
    anything && missing.length > 0
      ? { region: "nameplate", why: `${missing.join(", ")} unreadable` }
      : null;
  return { observations, retake, noNameplate: !anything, dropped };
}
