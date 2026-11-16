import { PhotoLabel, Scenario, type Field } from "@bankai/schemas";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import { fakeVision } from "../models/fake";
import { memoryMeter, memoryTracer } from "../models/meter";
import type { Fields } from "../models/types";
import { perceivePhoto } from "../perceive";
import { loadProject } from "../project/load";
import type { Project } from "../project/types";
import { verifyEquipment } from "../verify";
import { caseCorrect, caseFabricated, fieldMatches, summarize } from "./metrics";
import type { CaseResult, EvalResult, FieldResult, ModelsFor } from "./types";

async function readAll<T>(dir: string, schema: z.ZodType<T>): Promise<T[]> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter(
    (n) => n.endsWith(".json") && n !== "_template.json",
  );
  return Promise.all(
    names.sort().map(async (n) => schema.parse(await Bun.file(join(dir, n)).json())),
  );
}

/**
 * Score the pipeline on a set (`<set>/photos`, `labels`, `scenarios`). Scenarios
 * give verdict metrics; labels give field accuracy on the same photos (a live
 * run hits the cache for photos read twice).
 */
export async function runEval(opts: {
  set: string;
  projectRoot: string;
  models: ModelsFor;
  noCrop?: boolean;
}): Promise<EvalResult> {
  const photo = (name: string) => join(opts.set, "photos", name);
  const projects = new Map<string, Project>();
  const project = async (name: string) => {
    if (!projects.has(name)) projects.set(name, await loadProject(join(opts.projectRoot, name)));
    return projects.get(name)!;
  };
  const models = new Set<string>();
  let costUsd = 0;

  const cases: CaseResult[] = [];
  for (const s of await readAll(join(opts.set, "scenarios"), Scenario)) {
    const photos = s.photos.map(photo);
    const p = await project(s.project);
    const actual = await verifyEquipment(
      { photos, location: s.location, noCrop: opts.noCrop },
      { project: p, models: opts.models(photos), tracer: memoryTracer(s.id) },
    );
    actual.models.forEach((m) => models.add(m));
    costUsd += actual.cost_usd;
    cases.push({
      id: s.id,
      kind: s.kind,
      expected: s.expected,
      actual,
      correct: caseCorrect(s.expected, actual),
      fabricated: caseFabricated(s, actual, p),
    });
  }

  const fields: FieldResult[] = [];
  for (const label of await readAll(join(opts.set, "labels"), PhotoLabel)) {
    const path = photo(label.photo);
    const meter = memoryMeter();
    const r = await perceivePhoto([path], opts.models([path]), meter, memoryTracer(label.photo), {
      noCrop: opts.noCrop,
    });
    costUsd += meter.total().cost_usd;
    for (const [field, expected] of Object.entries(label.fields) as [Field, string][]) {
      if (expected === "unreadable") continue; // abstaining there is right; scored by retake, not here
      const actual = r.observations.find((o) => o.field === field)?.value ?? null;
      fields.push({
        photo: label.photo,
        field,
        expected,
        actual,
        correct: fieldMatches(field, expected, actual),
      });
    }
  }

  return summarize(cases, fields, { costUsd, models: [...models], noCrop: opts.noCrop ?? false });
}

interface FakeEntry {
  plate: { x: number; y: number; w: number; h: number } | null;
  tags: string[];
  primary: Fields;
  checker: Fields;
}

/** Offline models for a set: `<set>/fake-models.json` scripts each photo by file name. */
export async function fakeModelsFor(set: string): Promise<ModelsFor> {
  const script = (await Bun.file(join(set, "fake-models.json")).json()) as Record<
    string,
    FakeEntry
  >;
  return (photos) => {
    const name = photos[0]?.split("/").pop() ?? "";
    const e = script[name];
    if (!e) throw new Error(`fake-models.json has no entry for ${name}`);
    return {
      primary: fakeVision("fake-primary", {
        "*": { plate: e.plate, tags: e.tags, fields: e.primary },
      }),
      checker: fakeVision("fake-checker", { "*": { plate: e.plate, tags: [], fields: e.checker } }),
    };
  };
}
