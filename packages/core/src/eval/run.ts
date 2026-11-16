import { PhotoLabel, Scenario, type Field } from "@bankai/schemas";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { z } from "zod";
import { fakeVision } from "../models/fake";
import { memoryMeter, memoryTracer } from "../models/meter";
import type { Fields } from "../models/types";
import { perceivePhoto } from "../perceive";
import { loadProject } from "../project/load";
import type { Project } from "../project/types";
import { verifyEquipment } from "../verify";
import { caseCorrect, caseFabricated, fieldMatches, summarize } from "./metrics";
import { runNotes, type NoteModelsFor } from "./notes";
import type { CaseResult, EvalResult, FieldResult, ModelsFor } from "./types";

/** A set may name files only inside its own folders: "../" would let it read, or upload, anything. */
function plain(name: string, what: string): string {
  if (name !== basename(name) || name === "." || name === "..") {
    throw new Error(`${what} "${name}" must be a plain file name, no folders`);
  }
  return name;
}

async function readAll<T>(dir: string, schema: z.ZodType<T>, required: boolean): Promise<T[]> {
  const all = await readdir(dir).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT" && !required) return [] as string[];
    throw new Error(`${required ? "no scenarios: " : ""}cannot read ${dir} (${e.code})`);
  });
  const names = all.filter((n) => n.endsWith(".json") && n !== "_template.json");
  if (required && names.length === 0) throw new Error(`no scenarios in ${dir}`);
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
  /** Needed only when the set has voice notes (`<set>/voice/`). */
  noteModels?: NoteModelsFor;
}): Promise<EvalResult> {
  const photo = (name: string) => join(opts.set, "photos", plain(name, "photo"));
  const projects = new Map<string, Project>();
  const project = async (name: string) => {
    if (!projects.has(name))
      projects.set(name, await loadProject(join(opts.projectRoot, plain(name, "project"))));
    return projects.get(name)!;
  };
  const models = new Set<string>();
  let costUsd = 0;

  const cases: CaseResult[] = [];
  for (const s of await readAll(join(opts.set, "scenarios"), Scenario, true)) {
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
  const labelCosts: { photo: string; costUsd: number }[] = [];
  for (const label of await readAll(join(opts.set, "labels"), PhotoLabel, false)) {
    const path = photo(label.photo);
    const meter = memoryMeter();
    const r = await perceivePhoto([path], opts.models([path]), meter, memoryTracer(label.photo), {
      noCrop: opts.noCrop,
    });
    costUsd += meter.total().cost_usd;
    labelCosts.push({ photo: label.photo, costUsd: meter.total().cost_usd });
    for (const [field, expected] of Object.entries(label.fields) as [Field, string][]) {
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

  const notes = await runNotes({ set: opts.set, project, models: opts.noteModels, plain });
  const result = summarize(cases, fields, {
    costUsd: costUsd + (notes?.costUsd ?? 0),
    labelCosts,
    models: [...new Set([...models, ...(notes?.models ?? [])])],
    noCrop: opts.noCrop ?? false,
  });
  return { ...result, notes };
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
    // One script entry answers every call, so a second photo would silently get the first one's answer.
    if (photos.length !== 1) throw new Error("fake models script one photo per scenario");
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
