import type { ClaimType, Word } from "@bankai/schemas";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { NOTE_PROMPT, NOTE_PROMPT_VERSION } from "../note/prompts";
import { cacheFor, eitherOf, type CacheOpts } from "./cache";
import { costUsd } from "./config";
import { sha256Hex } from "./hash";
import type { Metered } from "./types";

// Model-facing schema: plain objects, no refine/default/transform (Gemini-safe).
const text = z.nullable(z.string());
const RawClaimOut = z.object({
  type: z.enum(["status", "date_change", "issue", "decision", "action_item"]),
  word_start: z.number(),
  word_end: z.number(),
  tag: text,
  activity_id: text,
  status_value: z.nullable(z.enum(["delivered", "set", "installed"])),
  location: text,
  delay_days: z.nullable(z.number()),
  spoken_date: text,
  component: text,
  issue_kind: z.nullable(z.enum(["missing", "damaged", "other"])),
  owner_role: text,
  text: z.string(),
});
const ExtractOut = z.object({ claims: z.array(RawClaimOut) });

export type RawClaim = z.infer<typeof RawClaimOut> & { type: ClaimType };

export interface ExtractInput {
  words: Word[];
  tags: string[];
  activities: { id: string; name: string }[];
  components: string[];
  locations: string[];
}

export interface ExtractModel {
  id: string;
  extract(input: ExtractInput): Promise<Metered<RawClaim[]>>;
}

const CALL_TIMEOUT_MS = 60_000;

const render = (i: ExtractInput) =>
  [
    `Words: ${i.words.map((w) => `${w.i}:${w.text}`).join(" ")}`,
    `Tags: ${i.tags.join(", ")}`,
    `Activities: ${i.activities.map((a) => `${a.id} ${a.name}`).join("; ")}`,
    `Components: ${i.components.join(", ")}`,
    `Locations: ${i.locations.join(", ")}`,
  ].join("\n");

/** Any AI SDK language model as a claim extractor over a numbered transcript. */
export function aiExtractor(id: string, model: LanguageModel): ExtractModel {
  return {
    id,
    async extract(input) {
      const started = performance.now();
      const r = await generateText({
        model,
        temperature: 0,
        timeout: CALL_TIMEOUT_MS,
        output: Output.object({ schema: ExtractOut }),
        system: NOTE_PROMPT,
        prompt: render(input),
      });
      const ms = Math.round(performance.now() - started);
      const usd = costUsd(id, r.usage.inputTokens, r.usage.outputTokens);
      return { value: r.output.claims, cost: { model: id, ms, usd } };
    },
  };
}

const wordsKey = (input: ExtractInput) => sha256Hex(input.words.map((w) => w.text).join(" "));

/** Offline extractor for tests, keyed by the first 12 hex chars of sha256(words joined by spaces); "*" answers the rest. */
export function fakeExtractor(id: string, script: Record<string, RawClaim[]>): ExtractModel {
  return {
    id,
    async extract(input) {
      const claims = script[wordsKey(input).slice(0, 12)] ?? script["*"];
      if (!claims) throw new Error(`fakeExtractor ${id}: no script for these words`);
      return { value: claims, cost: { model: id, ms: 0, usd: 0 } };
    },
  };
}

export function withExtractCache(m: ExtractModel, opts: CacheOpts): ExtractModel {
  const cached = cacheFor(m.id, opts);
  return {
    id: m.id,
    extract: (input) =>
      cached(["extract", NOTE_PROMPT_VERSION, JSON.stringify(input)], () => m.extract(input)),
  };
}

export function withExtractFallback(a: ExtractModel, b: ExtractModel): ExtractModel {
  return {
    id: `${a.id}|${b.id}`,
    extract: (input) =>
      eitherOf(
        "extraction models",
        [a.id, b.id],
        () => a.extract(input),
        () => b.extract(input),
      ),
  };
}
