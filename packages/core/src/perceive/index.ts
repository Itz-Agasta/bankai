import type { Field, Observation, RetakeRequest } from "@bankai/schemas";
import { basename } from "node:path";
import type { Meter, Tracer } from "../models/meter";
import type { VisionModel } from "../models/types";
import { cropPadded, loadImage } from "./image";
import { mergeReadings } from "./merge";

export { loadImage } from "./image";
export { validateField } from "./validators";

const REQUIRED: Field[] = ["manufacturer", "model"];

export interface Perception {
  observations: Observation[];
  retake: RetakeRequest | null;
  noNameplate: boolean;
}

/** Locate, crop, read with two model families, merge. The models perceive; nothing here decides. */
export async function perceivePhoto(
  paths: string[],
  models: { primary: VisionModel; checker: VisionModel },
  meter: Meter,
  tracer: Tracer,
): Promise<Perception> {
  const observations: Observation[] = [];
  let platesFound = 0;
  let anything = false;

  for (const [i, path] of paths.entries()) {
    const img = await loadImage(path);
    const file = basename(path);
    const located = await models.primary.locate(img);
    meter.record(located.cost.model, located.cost.ms, located.cost.usd);
    const { plate, tags } = located.value;
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
    platesFound++;

    const crop = await cropPadded(img, plate);
    const [p, c] = await Promise.all([models.primary.read(crop), models.checker.read(crop)]);
    for (const [step, r] of [
      ["read.primary", p],
      ["read.checker", c],
    ] as const) {
      meter.record(r.cost.model, r.cost.ms, r.cost.usd);
      tracer.step(step, crop, `${Object.keys(r.value).length} fields`, r.cost);
    }
    const merged = mergeReadings(p.value, c.value);
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
    platesFound > 0 && missing.length > 0
      ? { region: "nameplate", why: `${missing.join(", ")} unreadable` }
      : null;
  return { observations, retake, noNameplate: !anything };
}
