import type {
  Claim,
  DroppedClaim,
  NoteResult,
  NoteRun,
  ProposedUpdate,
  Word,
} from "@bankai/schemas";
import { basename } from "node:path";
import calibrator from "../../calibrator.json";
import type { ExtractModel } from "../models/extract";
import { memoryMeter, type Tracer } from "../models/meter";
import type { Segment, Transcript, TranscriptionModel } from "../models/types";
import type { Project } from "../project/types";
import { loadAudio } from "./audio";
import { extractInput } from "./extract";
import { findNames, ground, redactNames, scrubNames, vocabOf, type GroundedClaim } from "./ground";
import { linkClaim, type ClaimLink } from "./link";
import { proposeForClaim } from "./propose";
import { whisperPrompt } from "./whisper-prompt";

export interface NoteDeps {
  project: Project;
  models: { speech: TranscriptionModel; extract: ExtractModel };
  tracer: Tracer;
}

const NO_SPEECH = 0.5;
const FOLDED_GROUNDING = 0.7;

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Whisper's confidence over the segments a claim's words fall in; null without logprobs. */
function speechConfidence(segments: Segment[], c: GroundedClaim, words: Word[]): number | null {
  const from = words[c.word_start]!.start;
  const to = words[c.word_end]!.end;
  const lp = segments
    .filter((s) => s.end > from && s.start < to && s.avgLogprob !== null)
    .map((s) => s.avgLogprob!);
  return lp.length ? Math.min(1, Math.exp(mean(lp))) : null;
}

function claimConfidence(c: GroundedClaim, link: ClaimLink, speech: number | null): number {
  const parts = [c.exact ? 1 : FOLDED_GROUNDING, link.score];
  if (speech !== null) parts.push(speech);
  return Math.round(mean(parts) * 1000) / 1000;
}

const silent = (t: Transcript) =>
  t.words.length === 0 ||
  (t.segments.length > 0 && t.segments.every((s) => (s.noSpeechProb ?? 0) > NO_SPEECH));

/** A walk note in, cited claims and rule-written proposals out. Unsure means a person decides. */
export async function processNote(input: { audio: string }, deps: NoteDeps): Promise<NoteRun> {
  const { project, models, tracer } = deps;
  const audio = await loadAudio(input.audio);
  const id = `note_${audio.hash.slice(0, 12)}`;
  const name = basename(input.audio);
  const meter = memoryMeter();
  const vocab = vocabOf(project);

  const finish = (
    status: NoteResult["status"],
    reason: string,
    transcript: Word[] = [],
    claims: Claim[] = [],
    updates: ProposedUpdate[] = [],
    dropped: DroppedClaim[] = [],
  ): NoteRun => {
    const confidence = claims.length
      ? Math.min(...claims.map((c) => c.confidence))
      : status === "needs_human"
        ? 0
        : 1;
    tracer.step("decide", id, `${status} ${confidence} ${reason}`);
    return {
      result: { id, claims, updates, status, confidence, ...meter.total() },
      transcript,
      dropped,
    };
  };

  let t: Transcript;
  try {
    const r = await models.speech.transcribe(audio.bytes, whisperPrompt(vocab));
    meter.record(r.cost.model, r.cost.ms, r.cost.usd);
    tracer.step("transcribe", audio.bytes, `${r.value.words.length} words`, r.cost);
    t = r.value;
  } catch (e) {
    tracer.step("transcribe", audio.bytes, `transcription_unavailable: ${(e as Error).message}`);
    return finish("needs_human", "transcription_unavailable");
  }
  if (silent(t)) return finish("needs_human", "no_speech");

  const names = findNames(t.words, vocab);
  const words = redactNames(t.words, names);
  let raw;
  try {
    const r = await models.extract.extract(extractInput(words, project));
    meter.record(r.cost.model, r.cost.ms, r.cost.usd);
    tracer.step("extract", JSON.stringify(words), `${r.value.length} claims`, r.cost);
    raw = r.value;
  } catch (e) {
    tracer.step(
      "extract",
      JSON.stringify(words),
      `extraction_unavailable: ${(e as Error).message}`,
    );
    return finish("needs_human", "extraction_unavailable", words);
  }

  const grounded: GroundedClaim[] = [];
  const dropped: DroppedClaim[] = [];
  for (const c of raw) {
    const g = ground(c, words, vocab, name);
    if ("claim" in g) grounded.push({ ...g.claim, text: scrubNames(g.claim.text, names) });
    else dropped.push(g.dropped);
  }
  tracer.step("ground", id, `${grounded.length} kept, ${dropped.length} dropped`);

  const claims: Claim[] = [];
  const updates: ProposedUpdate[] = [];
  let human: string | null = null;
  let conflict = false;
  grounded.forEach((c, k) => {
    const n = k + 1;
    const link = linkClaim(c, project);
    const out = proposeForClaim(c, link, project, id, n);
    const confidence = claimConfidence(c, link, speechConfidence(t.segments, c, words));
    claims.push({
      id: `clm_${id}_${n}`,
      type: c.type,
      text: c.text,
      span: c.span,
      links: link.links,
      confidence,
    });
    if (out.update) updates.push({ ...out.update, confidence });
    if (out.checks.some((x) => x.result === "fail")) conflict = true;
    if (out.needsHuman) human ??= out.needsHuman;
    else if (confidence < calibrator.threshold) human ??= "confidence below threshold";
  });
  tracer.step("rules", id, `${updates.length} proposals${human ? `, ${human}` : ""}`);

  const status = human ? "needs_human" : conflict ? "flagged" : "confirmed";
  return finish(
    status,
    human ?? (conflict ? "conflicts with records" : "ok"),
    words,
    claims,
    updates,
    dropped,
  );
}
