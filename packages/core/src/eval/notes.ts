import { NoteScenario, type Claim, type NoteResult, type ProposedUpdate } from "@bankai/schemas";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { normalizeTag } from "../link/normalize";
import { fakeExtractor, type ExtractModel, type RawClaim } from "../models/extract";
import { memoryTracer } from "../models/meter";
import { fakeTranscriber } from "../models/speech";
import type { Transcript, TranscriptionModel } from "../models/types";
import { activitySpoken, hasDelay, spokenAs, vocabOf } from "../note/ground";
import { processNote } from "../note/process";
import { foldTokens } from "../note/spoken";
import type { Project } from "../project/types";

export type NoteModels = { speech: TranscriptionModel; extract: ExtractModel };
/** Note models for one audio file (fakes script per file; live runs return the same pair). */
export type NoteModelsFor = (audio: string) => NoteModels;

export interface NoteCaseResult {
  id: string;
  expected: NoteScenario["expected"];
  actual: NoteResult;
  matched: number;
  statusCorrect: boolean;
  fabricatedClaims: number;
}

export interface NotesResult {
  cases: NoteCaseResult[];
  claimPrecision: number | null;
  claimRecall: number | null;
  statusAccuracy: number | null;
  /** Returned claims naming a tag, activity or day count the speaker never said. */
  fabricated: number;
  costUsd: number;
  meanLatencyMs: number;
  models: string[];
}

const ratio = (n: number, d: number) => (d === 0 ? null : n / d);
const refOf = (c: Claim, kind: string) => c.links.find((l) => l.kind === kind)?.ref;
const tagOf = (c: Claim) => refOf(c, "equipment_schedule_row")?.split("#")[1];
/** Claim and update share their content key: clm_<note>_<key> and upd_<note>_<key>. */
const updateOf = (c: Claim, us: ProposedUpdate[]) =>
  us.find((u) => u.id.split("_").at(-1) === c.id.split("_").at(-1));

function claimMatches(e: NoteScenario["expected"]["claims"][number], c: Claim, r: NoteResult) {
  if (e.type !== c.type) return false;
  if (e.tag && tagOf(c) !== e.tag) return false;
  if (e.activity && refOf(c, "schedule_activity") !== e.activity) return false;
  if (e.value) {
    const said = `${updateOf(c, r.updates)?.new ?? ""} ${c.text}`.toLowerCase();
    if (!said.includes(e.value.toLowerCase())) return false;
  }
  return true;
}

/** Greedy one-to-one: each expected claim takes the first unused returned claim that fits. */
function countMatches(s: NoteScenario, r: NoteResult): number {
  const used = new Set<string>();
  let n = 0;
  for (const e of s.expected.claims) {
    const hit = r.claims.find((c) => !used.has(c.id) && claimMatches(e, c, r));
    if (hit) {
      used.add(hit.id);
      n++;
    }
  }
  return n;
}

/** Scored against the TTS script, not the transcript: a mishearing the model ran with still counts. */
function fabricatedClaims(r: NoteResult, script: string, project: Project): number {
  const tokens = foldTokens(script.split(/\s+/));
  const vocab = vocabOf(project);
  return r.claims.filter((c) => {
    const tag = tagOf(c);
    if (tag && !spokenAs(tokens, tag, normalizeTag)) return true;
    const act = vocab.activities.find((a) => a.id === refOf(c, "schedule_activity"));
    if (act && !activitySpoken(tokens, act)) return true;
    const u = updateOf(c, r.updates);
    if (u?.field === "delay_days" && !hasDelay(tokens, Number(u.new) - Number(u.old))) return true;
    return false;
  }).length;
}

/** `<set>/voice/<id>.json` scenarios over `<set>/audio/`; null when the set has no voice notes. */
export async function runNotes(opts: {
  set: string;
  project: (name: string) => Promise<Project>;
  models?: NoteModelsFor;
  plain: (name: string, what: string) => string;
}): Promise<NotesResult | null> {
  const dir = join(opts.set, "voice");
  const names = await readdir(dir).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (names === null) return null;
  const files = names.filter((n) => /^n\d+.*\.json$/.test(n)).sort();
  if (files.length === 0) return null;
  if (!opts.models)
    throw new Error(
      `${dir} has voice notes but no speech models: set GROQ_API_KEY (or use --fake)`,
    );

  const cases: NoteCaseResult[] = [];
  const models = new Set<string>();
  let costUsd = 0;
  for (const f of files) {
    const s = NoteScenario.parse(await Bun.file(join(dir, f)).json());
    const audio = join(opts.set, "audio", opts.plain(s.audio, "audio"));
    const project = await opts.project(s.project);
    const script = await Bun.file(join(dir, `${opts.plain(s.id, "note id")}.txt`)).text();
    const { result } = await processNote(
      { audio },
      { project, models: opts.models(audio), tracer: memoryTracer },
    );
    result.models.forEach((m) => models.add(m));
    costUsd += result.cost_usd;
    cases.push({
      id: s.id,
      expected: s.expected,
      actual: result,
      matched: countMatches(s, result),
      statusCorrect: result.status === s.expected.status,
      fabricatedClaims: fabricatedClaims(result, script, project),
    });
  }
  const sum = (f: (c: NoteCaseResult) => number) => cases.reduce((a, c) => a + f(c), 0);
  return {
    cases,
    claimPrecision: ratio(
      sum((c) => c.matched),
      sum((c) => c.actual.claims.length),
    ),
    claimRecall: ratio(
      sum((c) => c.matched),
      sum((c) => c.expected.claims.length),
    ),
    statusAccuracy: ratio(cases.filter((c) => c.statusCorrect).length, cases.length),
    fabricated: sum((c) => c.fabricatedClaims),
    costUsd: Math.round(costUsd * 1e6) / 1e6,
    meanLatencyMs: Math.round(
      ratio(
        sum((c) => c.actual.latency_ms),
        cases.length,
      ) ?? 0,
    ),
    models: [...models],
  };
}

/** Offline note models: `<set>/voice/fake-notes.json` scripts each audio file by name. Undefined if absent. */
export async function fakeNoteModelsFor(set: string): Promise<NoteModelsFor | undefined> {
  const file = Bun.file(join(set, "voice", "fake-notes.json"));
  if (!(await file.exists())) return undefined;
  const script = (await file.json()) as Record<
    string,
    { transcript: Transcript; claims: RawClaim[] }
  >;
  return (audio) => {
    const name = audio.split("/").pop() ?? "";
    const e = script[name];
    if (!e) throw new Error(`fake-notes.json has no entry for ${name}`);
    return {
      speech: fakeTranscriber("fake-speech", { "*": e.transcript }),
      extract: fakeExtractor("fake-extract", { "*": e.claims }),
    };
  };
}
