import { describe, expect, test } from "bun:test";
import { MockTranscriptionModelV4 } from "ai/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aiTranscriber,
  audioMediaType,
  fakeTranscriber,
  speechCostUsd,
  withSpeechCache,
  withSpeechFallback,
} from "../src/models/speech";
import type { Transcript, TranscriptionModel } from "../src/models/types";

const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 1, 2]);
const T: Transcript = {
  words: [{ i: 0, text: "Gen", start: 0, end: 0.4 }],
  segments: [{ start: 0, end: 0.4, avgLogprob: -0.1, noSpeechProb: 0.01 }],
  language: "en",
  duration: 0.4,
};

function counting(inner: TranscriptionModel) {
  const calls = { n: 0 };
  const m: TranscriptionModel = {
    id: inner.id,
    transcribe: (a, p) => (calls.n++, inner.transcribe(a, p)),
  };
  return { m, calls };
}

const tmp = () => mkdtemp(join(tmpdir(), "bankai-speech-"));

describe("speech model", () => {
  test("cache key includes the prompt", async () => {
    const { m, calls } = counting(fakeTranscriber("fake-speech", { "*": T }));
    const c = withSpeechCache(m, { dir: await tmp(), replayOnly: false });
    await c.transcribe(WAV, "GEN-3");
    await c.transcribe(WAV, "GEN-3");
    await c.transcribe(WAV, "TX-1");
    expect(calls.n).toBe(2);
  });

  test("replay miss is PERCEPTION_UNAVAILABLE", async () => {
    const c = withSpeechCache(fakeTranscriber("fake-speech", { "*": T }), {
      dir: await tmp(),
      replayOnly: true,
    });
    expect(c.transcribe(WAV, "")).rejects.toMatchObject({ code: "PERCEPTION_UNAVAILABLE" });
  });

  test("fallback used when primary throws, labelled with fallback id", async () => {
    const broken: TranscriptionModel = {
      id: "broken",
      transcribe: () => Promise.reject(new Error("503")),
    };
    const r = await withSpeechFallback(broken, fakeTranscriber("backup", { "*": T })).transcribe(
      WAV,
      "",
    );
    expect(r.cost.model).toBe("backup");
    expect(r.value.words).toHaveLength(1);
  });

  test("both failing is PERCEPTION_UNAVAILABLE", async () => {
    const broken: TranscriptionModel = {
      id: "broken",
      transcribe: () => Promise.reject(new Error("503")),
    };
    expect(withSpeechFallback(broken, broken).transcribe(WAV, "")).rejects.toMatchObject({
      code: "PERCEPTION_UNAVAILABLE",
    });
  });

  test("speechCostUsd bills at least 10 s", () => {
    expect(speechCostUsd("whisper-large-v3-turbo", 3)).toBeCloseTo((10 / 3600) * 0.04, 10);
    expect(speechCostUsd("whisper-large-v3", 36)).toBeCloseTo((36 / 3600) * 0.111, 10);
  });

  test("words are trimmed and indexed, logprobs read from the raw body", async () => {
    const seen: { mediaType?: string; providerOptions?: unknown } = {};
    const model = new MockTranscriptionModelV4({
      doGenerate: async (o) => {
        seen.mediaType = o.mediaType;
        seen.providerOptions = o.providerOptions;
        return {
          text: "Gen three,",
          segments: [],
          language: "en",
          durationInSeconds: 1,
          warnings: [],
          response: {
            timestamp: new Date(),
            modelId: "whisper-large-v3-turbo",
            body: {
              text: "Gen three,",
              duration: 1,
              language: "en",
              segments: [{ start: 0, end: 1, avg_logprob: -0.2, no_speech_prob: 0.02 }],
              words: [
                { word: " Gen", start: 0, end: 0.4 },
                { word: " three,", start: 0.4, end: 1 },
              ],
            },
          },
        };
      },
    });
    const r = await aiTranscriber("whisper-large-v3-turbo", model).transcribe(WAV, "GEN-3");
    expect(r.value.words).toEqual([
      { i: 0, text: "Gen", start: 0, end: 0.4 },
      { i: 1, text: "three,", start: 0.4, end: 1 },
    ]);
    expect(r.value.segments).toEqual([{ start: 0, end: 1, avgLogprob: -0.2, noSpeechProb: 0.02 }]);
    expect(r.cost.usd).toBeCloseTo((10 / 3600) * 0.04, 10);
    expect(seen.mediaType).toBe("audio/wav");
    expect(seen.providerOptions).toEqual({
      groq: {
        responseFormat: "verbose_json",
        timestampGranularities: ["word", "segment"],
        prompt: "GEN-3",
        language: "en",
        temperature: 0,
      },
    });
  });

  test("audioMediaType sniffs bytes, not names", () => {
    expect(audioMediaType(WAV)).toBe("audio/wav");
    expect(audioMediaType(new TextEncoder().encode("ID3\x04rest"))).toBe("audio/mpeg");
    expect(audioMediaType(new TextEncoder().encode("OggSxxxx"))).toBe("audio/ogg");
    expect(audioMediaType(new TextEncoder().encode("fLaCxxxx"))).toBe("audio/flac");
    expect(audioMediaType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0]))).toBe("audio/webm");
    expect(audioMediaType(new TextEncoder().encode("\0\0\0\x20ftypM4A "))).toBe("audio/mp4");
    expect(audioMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
  });
});
