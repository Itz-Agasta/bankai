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
      ["text", "ELEC-02: Action for ELEC-02: confirm cable delivery by Friday."],
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
    expect(r.result.status).toBe("needs_human");
    expect(r.dropped).toEqual([
      { word_start: 5, word_end: 11, type: "status", reason: "tag_not_in_span" },
    ]);
  });

  test("no words: needs_human and the extractor is not called", async () => {
    let called = false;
    const never: ExtractModel = { id: "never", extract: () => ((called = true), throwing("x")()) };
    const r = await run(wav.silent, { extract: never });
    expect(called).toBe(false);
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

describe("review fixes: processNote", () => {
  const LOWER =
    "load bank test is delayed three days action for ELEC-02 confirm cable by friday ask priya about the door";
  const one = (text: string, claims: unknown, names: number[] = []) => ({
    speech: fakeTranscriber("fake-speech", { "*": transcript(text) }),
    extract: fakeExtractor("fake-extract", { "*": { claims, names } } as never),
  });
  const raw = (over: object) => ({
    type: "status",
    word_start: 0,
    word_end: 0,
    tag: null,
    activity_id: null,
    status_value: null,
    location: null,
    delay_days: null,
    spoken_date: null,
    component: null,
    issue_kind: null,
    owner_role: null,
    text: "x",
    ...over,
  });

  test("a name only the extractor recognised is redacted everywhere", async () => {
    const words = LOWER.split(" ");
    const priya = words.indexOf("priya");
    const claims = [
      raw({ type: "action_item", word_start: 7, word_end: 11, text: "confirm cable by friday" }),
    ];
    const r = await run(wav.n001, one(LOWER, claims, [priya]));
    expect(JSON.stringify(r)).not.toContain("priya");
    expect(r.transcript[priya]!.text).toBe("[name]");
  });

  test("update and claim ids do not depend on claim order", async () => {
    const a = raw({
      type: "date_change",
      activity_id: "A30",
      delay_days: 3,
      word_start: 0,
      word_end: 6,
      text: "delay",
    });
    const b = raw({
      type: "action_item",
      owner_role: "ELEC-02",
      word_start: 7,
      word_end: 12,
      text: "confirm cable",
    });
    const r1 = await run(wav.n001, one(LOWER, [a, b]));
    const r2 = await run(wav.n001, one(LOWER, [b, a]));
    const ids = (r: NoteRun) => r.result.updates.map((u) => u.id).sort();
    expect(ids(r2)).toEqual(ids(r1));
    expect(r1.result.claims.map((c) => c.id).sort()).toEqual(
      r2.result.claims.map((c) => c.id).sort(),
    );
  });

  test("a flagged claim carries the failing checks", async () => {
    const r = await run(wav.n002);
    const checks = r.result.claims[0]!.checks;
    expect(checks.find((c) => c.name === "revision")?.result).toBe("fail");
    expect(checks.find((c) => c.name === "location")?.reason).toContain("belongs at PAD-B");
  });

  test("a conflict stays flagged when another claim was dropped", async () => {
    const claims = [
      raw({ tag: "GEN-3", status_value: "set", location: "PAD-A", word_start: 0, word_end: 7 }),
      raw({
        type: "issue",
        tag: "GEN-3",
        component: "day tank",
        issue_kind: "missing",
        word_start: 10,
        word_end: 15,
      }),
    ];
    const r = await run(wav.n002, one(N002, claims));
    expect(r.dropped).toHaveLength(1);
    expect(r.result.status).toBe("flagged");
  });

  test("a negated claim needs a human", async () => {
    const text = "gen three is not set yet";
    const claims = [raw({ tag: "GEN-3", status_value: "set", word_start: 0, word_end: 5 })];
    const r = await run(wav.n001, one(text, claims));
    expect(r.result.status).toBe("needs_human");
    expect(r.result.updates).toEqual([]);
  });
});

describe("cubic fixes: processNote", () => {
  test("two decisions in one span are both kept", async () => {
    const text = "we decided two things today";
    const d = (t: string) => ({
      type: "decision",
      word_start: 0,
      word_end: 4,
      tag: null,
      activity_id: null,
      status_value: null,
      location: null,
      delay_days: null,
      spoken_date: null,
      component: null,
      issue_kind: null,
      owner_role: null,
      text: t,
    });
    const r = await run(wav.n001, {
      speech: fakeTranscriber("s", { "*": transcript(text) }),
      extract: fakeExtractor("e", { "*": [d("use route B"), d("move the crane")] } as never),
    });
    expect(r.result.claims).toHaveLength(2);
  });

  test("a hyphenated name the model flags is redacted", async () => {
    const text = "ask mary-ann about the door"; // lower case: only the model can flag it
    const r = await run(wav.n001, {
      speech: fakeTranscriber("s", { "*": transcript(text) }),
      extract: fakeExtractor("e", { "*": { claims: [], names: [1] } } as never),
    });
    expect(JSON.stringify(r)).not.toContain("mary");
  });
});
