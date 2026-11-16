import { beforeAll, describe, expect, test } from "bun:test";
import type { NoteRun } from "@bankai/schemas";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fakeExtractor, type ExtractModel } from "../src/models/extract";
import { memoryTracer } from "../src/models/meter";
import { fakeTranscriber } from "../src/models/speech";
import type { Transcript, TranscriptionModel } from "../src/models/types";
import { loadAudio, processNote } from "../src/note";
import type { Project } from "../src/project/types";
import { extractScript, N001, N002, N003, transcript, wavFiles, wavHash } from "./fixtures/notes";
import { loadMini } from "./helpers";

let mini: Project;
let wav: Awaited<ReturnType<typeof wavFiles>>;
let speech: TranscriptionModel;
const extract = fakeExtractor("fake-extract", extractScript());
const SILENT: Transcript = { words: [], segments: [], language: "en", duration: 2 };

beforeAll(async () => {
  mini = await loadMini();
  wav = await wavFiles();
  speech = fakeTranscriber("fake-speech", {
    [await wavHash(wav.n001)]: transcript(N001),
    [await wavHash(wav.n002)]: transcript(N002),
    [await wavHash(wav.n003)]: transcript(N003),
    [await wavHash(wav.silent)]: SILENT,
  });
});

const run = (audio: string, models: { speech?: TranscriptionModel; extract?: ExtractModel } = {}) =>
  processNote(
    { audio },
    {
      project: mini,
      models: { speech: models.speech ?? speech, extract: models.extract ?? extract },
      tracer: memoryTracer,
    },
  );

const throwing = (what: string) => () => Promise.reject(new Error(`${what} down`));

describe("processNote", () => {
  test("n001 is confirmed with an install proposal", async () => {
    const r = await run(wav.n001);
    expect(r.result.status).toBe("confirmed");
    expect(r.result.id).toBe(`note_${await wavHash(wav.n001)}`);
    expect(r.result.claims).toHaveLength(1);
    expect(r.result.claims[0]!.span.ref).toBe("n001.wav@2.0-4.8");
    expect(r.result.updates).toHaveLength(1);
    expect(r.result.updates[0]).toMatchObject({ field: "install_status", new: "set at PAD-B" });
    expect(r.result.models).toEqual(["fake-speech", "fake-extract"]);
  });

  test("n002 is flagged with no proposal", async () => {
    const r = await run(wav.n002);
    expect(r.result.status).toBe("flagged");
    expect(r.result.updates).toEqual([]);
    expect(r.result.claims).toHaveLength(1);
  });

  test("n003: delay and action proposed, the unnamed unit's issue needs a human, no name leaks", async () => {
    const r = await run(wav.n003);
    expect(r.result.status).toBe("needs_human");
    expect(r.result.claims.map((c) => c.type)).toEqual(["date_change", "action_item", "issue"]);
    expect(r.result.updates.map((u) => [u.field, u.new])).toEqual([
      ["delay_days", "3"],
      ["text", "ELEC-02: confirm cable delivery by Friday"],
    ]);
    expect(JSON.stringify(r)).not.toContain("Ravi");
  });

  test("every claim and update carries an audio_span citation", async () => {
    const r = await run(wav.n003);
    for (const c of r.result.claims) expect(c.span.kind).toBe("audio_span");
    for (const u of r.result.updates) expect(u.evidence[0]?.kind).toBe("audio_span");
  });

  test("a claim the transcript does not support is dropped and reported", async () => {
    const lying = fakeExtractor("fake-extract", {
      "*": [
        {
          type: "status",
          word_start: 5,
          word_end: 11,
          tag: "GEN-4",
          activity_id: null,
          status_value: "set",
          location: "PAD-B",
          delay_days: null,
          spoken_date: null,
          component: null,
          issue_kind: null,
          owner_role: null,
          text: "GEN-4 set",
        },
      ],
    });
    const r = await run(wav.n001, { extract: lying });
    expect(r.result.claims).toEqual([]);
    expect(r.dropped).toEqual([
      { word_start: 5, word_end: 11, type: "status", reason: "tag_not_in_span" },
    ]);
  });

  test("no words: needs_human and the extractor is not called", async () => {
    const never: ExtractModel = { id: "never", extract: throwing("extract should not run") };
    const r = await run(wav.silent, { extract: never });
    expect(r.result.status).toBe("needs_human");
    expect(r.result.claims).toEqual([]);
    expect(r.transcript).toEqual([]);
  });

  test("all segments without speech: needs_human", async () => {
    const t = transcript(N001);
    const quiet = fakeTranscriber("fake-speech", {
      "*": { ...t, segments: t.segments.map((s) => ({ ...s, noSpeechProb: 0.9 })) },
    });
    const r = await run(wav.n001, { speech: quiet });
    expect(r.result.status).toBe("needs_human");
    expect(r.result.claims).toEqual([]);
  });

  test("transcription failure returns needs_human with no claims", async () => {
    const r = await run(wav.n001, { speech: { id: "down", transcribe: throwing("speech") } });
    expect(r.result.status).toBe("needs_human");
    expect(r.result.claims).toEqual([]);
    expect(r.transcript).toEqual([]);
  });

  test("extraction failure keeps the transcript", async () => {
    const r = await run(wav.n001, { extract: { id: "down", extract: throwing("extract") } });
    expect(r.result.status).toBe("needs_human");
    expect(r.transcript.map((w) => w.text).join(" ")).toBe(N001);
  });

  test("the same audio gives the same ids", async () => {
    const a: NoteRun = await run(wav.n001);
    const b: NoteRun = await run(wav.n001);
    expect(b.result.id).toBe(a.result.id);
    expect(b.result.updates.map((u) => u.id)).toEqual(a.result.updates.map((u) => u.id));
  });
});

describe("loadAudio", () => {
  test("rejects a jpeg", async () => {
    const p = join(import.meta.dir, "fixtures/plate.jpg");
    expect(loadAudio(p)).rejects.toMatchObject({ code: "INPUT_UNSUPPORTED" });
  });

  test("rejects a file over 25 MB", async () => {
    const p = join((await wavFiles()).n001, "..", "big.wav");
    const big = new Uint8Array(26 * 1024 * 1024);
    big.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    await writeFile(p, big);
    expect(loadAudio(p)).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
  });

  test("reads a wav with its hash and media type", async () => {
    const a = await loadAudio(wav.n001);
    expect(a.mediaType).toBe("audio/wav");
    expect(a.hash.slice(0, 12)).toBe(await wavHash(wav.n001));
  });
});
