import { z } from "zod";
import { cacheFor, eitherOf, type CacheOpts } from "./cache";
import { sha256Hex } from "./hash";
import type { Metered, Transcript, TranscriptionModel } from "./types";

/** USD per audio hour; Groq bills at least 10 s per request (groq.com/pricing, 2026-11-16). */
export const SPEECH_PRICES: Record<string, number> = {
  "whisper-large-v3-turbo": 0.04,
  "whisper-large-v3": 0.111,
};
const MIN_BILLED_SECONDS = 10;
const CALL_TIMEOUT_MS = 60_000;

export function speechCostUsd(model: string, seconds: number): number {
  const p = SPEECH_PRICES[model];
  if (p === undefined) return 0;
  return (Math.max(seconds, MIN_BILLED_SECONDS) / 3600) * p;
}

const ascii = (b: Uint8Array, at: number, s: string) =>
  [...s].every((ch, k) => b[at + k] === ch.charCodeAt(0));

/** Media type from the bytes; null for anything that is not a format Whisper takes. */
export function audioMediaType(b: Uint8Array): string | null {
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE")) return "audio/wav";
  if (ascii(b, 0, "ID3") || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  if (ascii(b, 4, "ftyp")) return "audio/mp4";
  if (ascii(b, 0, "OggS")) return "audio/ogg";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  if (ascii(b, 0, "fLaC")) return "audio/flac";
  return null;
}

// Groq's verbose_json. The AI SDK keeps only segments, so we read the raw body for words and logprobs.
const VerboseJson = z.object({
  duration: z.number().nullish(),
  language: z.string().nullish(),
  segments: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
        avg_logprob: z.number().nullish(),
        no_speech_prob: z.number().nullish(),
      }),
    )
    .nullish(),
  words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).nullish(),
});

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** The slice of an AI SDK transcription model (v4 spec) we call. `groq.transcription(id)` fits. */
export interface RawTranscriber {
  doGenerate(o: {
    audio: Uint8Array;
    mediaType: string;
    providerOptions?: Record<string, Record<string, Json>>;
    abortSignal?: AbortSignal;
  }): PromiseLike<{ response: { body?: unknown } }>;
}

export function aiTranscriber(id: string, model: RawTranscriber): TranscriptionModel {
  return {
    id,
    async transcribe(audio, prompt) {
      const mediaType = audioMediaType(audio) ?? "application/octet-stream";
      const started = performance.now();
      const r = await model.doGenerate({
        audio,
        mediaType,
        abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        providerOptions: {
          groq: {
            responseFormat: "verbose_json",
            timestampGranularities: ["word", "segment"],
            prompt,
            language: "en",
            temperature: 0,
          },
        },
      });
      const body = VerboseJson.parse(r.response.body);
      const words = (body.words ?? [])
        .map((w) => ({ text: w.word.trim(), start: w.start, end: w.end }))
        .filter((w) => w.text !== "")
        .map((w, i) => ({ i, ...w }));
      const duration = body.duration ?? words.at(-1)?.end ?? 0;
      const value: Transcript = {
        words,
        segments: (body.segments ?? []).map((s) => ({
          start: s.start,
          end: s.end,
          avgLogprob: s.avg_logprob ?? null,
          noSpeechProb: s.no_speech_prob ?? null,
        })),
        language: body.language ?? null,
        duration,
      };
      const ms = Math.round(performance.now() - started);
      return { value, cost: { model: id, ms, usd: speechCostUsd(id, duration) } };
    },
  };
}

/** Offline transcriber for tests, keyed by the first 12 hex chars of the audio sha256; "*" answers the rest. */
export function fakeTranscriber(
  id: string,
  script: Record<string, Transcript>,
): TranscriptionModel {
  return {
    id,
    async transcribe(audio): Promise<Metered<Transcript>> {
      const t = script[sha256Hex(audio).slice(0, 12)] ?? script["*"];
      if (!t) throw new Error(`fakeTranscriber ${id}: no script for audio`);
      return { value: t, cost: { model: id, ms: 0, usd: 0 } };
    },
  };
}

export function withSpeechCache(m: TranscriptionModel, opts: CacheOpts): TranscriptionModel {
  const cached = cacheFor(m.id, opts);
  return {
    id: m.id,
    transcribe: (audio, prompt) =>
      cached(["transcribe", sha256Hex(prompt), audio], () => m.transcribe(audio, prompt)),
  };
}

export function withSpeechFallback(
  a: TranscriptionModel,
  b: TranscriptionModel,
): TranscriptionModel {
  return {
    id: `${a.id}|${b.id}`,
    transcribe: (audio, prompt) =>
      eitherOf(
        "speech models",
        [a.id, b.id],
        () => a.transcribe(audio, prompt),
        () => b.transcribe(audio, prompt),
      ),
  };
}
