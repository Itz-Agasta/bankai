import type { Word } from "@bankai/schemas";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RawClaim } from "../../src/models/extract";
import { sha256Hex } from "../../src/models/hash";
import type { Transcript } from "../../src/models/types";

/** Whisper-shaped words (edge punctuation kept), 0.4 s apart. */
const words = (text: string): Word[] =>
  text.split(" ").map((t, i) => ({ i, text: t, start: i * 0.4, end: i * 0.4 + 0.35 }));

export const transcript = (text: string, avgLogprob = -0.1): Transcript => {
  const w = words(text);
  return {
    words: w,
    segments: [{ start: 0, end: w.at(-1)?.end ?? 0, avgLogprob, noSpeechProb: 0.01 }],
    language: "en",
    duration: w.at(-1)?.end ?? 0,
  };
};

const raw = (over: Partial<RawClaim>): RawClaim => ({
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

export const N001 =
  "Quick update from the yard. Gen three is set on pad B, anchors done. The controls cabinet looks fine.";
export const N002 = "Gen three has been set on pad A this morning. Day tank still on the truck.";
export const N003 =
  "Load bank test is delayed three days, waiting on the cable crew. Action for ELEC-02: confirm cable delivery by Friday. Ravi said the controls cabinet door is damaged.";
/** N003 as the extractor sees it: names already redacted. */
const N003_REDACTED = N003.replace("Ravi", "[name]");

const CLAIMS: Record<string, RawClaim[]> = {
  [N001]: [
    raw({
      tag: "GEN-3",
      status_value: "set",
      location: "PAD-B",
      word_start: 5,
      word_end: 11,
      text: "GEN-3 set on PAD-B",
    }),
  ],
  [N002]: [
    raw({
      tag: "GEN-3",
      status_value: "set",
      location: "PAD-A",
      word_start: 0,
      word_end: 7,
      text: "GEN-3 set on PAD-A",
    }),
  ],
  [N003_REDACTED]: [
    raw({
      type: "date_change",
      activity_id: "A30",
      delay_days: 3,
      word_start: 0,
      word_end: 6,
      text: "Load bank test delayed 3 days",
    }),
    raw({
      type: "action_item",
      owner_role: "ELEC-02",
      word_start: 12,
      word_end: 19,
      text: "confirm cable delivery by Friday",
    }),
    // A careless model echoing a name: the pipeline must scrub it.
    raw({
      type: "issue",
      component: "controls cabinet",
      issue_kind: "damaged",
      word_start: 20,
      word_end: 27,
      text: "Ravi reports controls cabinet door damaged",
    }),
  ],
};

/** Extractor script keyed the way fakeExtractor looks words up. */
export const extractScript = (): Record<string, RawClaim[]> =>
  Object.fromEntries(
    Object.entries(CLAIMS).map(([text, claims]) => [sha256Hex(text).slice(0, 12), claims]),
  );

/** A tiny distinct WAV per note so each has its own hash. */
export async function wavFiles(): Promise<Record<"n001" | "n002" | "n003" | "silent", string>> {
  const dir = await mkdtemp(join(tmpdir(), "bankai-notes-"));
  const out: Record<string, string> = {};
  for (const [k, n] of [
    ["n001", 1],
    ["n002", 2],
    ["n003", 3],
    ["silent", 4],
  ] as const) {
    const b = new Uint8Array([0x52, 0x49, 0x46, 0x46, n, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, n]);
    out[k] = join(dir, `${k}.wav`);
    await writeFile(out[k]!, b);
  }
  return out as Record<"n001" | "n002" | "n003" | "silent", string>;
}

export const wavHash = async (path: string) =>
  sha256Hex(new Uint8Array(await Bun.file(path).arrayBuffer())).slice(0, 12);
