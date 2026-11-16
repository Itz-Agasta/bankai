import { ActorId, type Citation, type Word } from "@bankai/schemas";
import { normalizeLocation, normalizeTag } from "../link/normalize";
import type { RawClaim } from "../models/extract";
import type { Project } from "../project/types";
import { cleanWord, foldSpoken, foldTokens, type Token } from "./spoken";

export interface Vocab {
  tags: string[];
  locations: string[];
  components: string[];
  manufacturers: string[];
  activities: { id: string; name: string; tag: string | null }[];
}

export type GroundedClaim = RawClaim & {
  span: Citation & { kind: "audio_span" };
  /** False when a key value matched only after folding spoken numbers ("gen three"). */
  exact: boolean;
  /** Spoken, but a person must judge it: the span names other units too, or the verb is negated. */
  doubt: "ambiguous_span" | "negated" | null;
};

export type GroundResult =
  | { claim: GroundedClaim }
  | { dropped: { word_start: number; word_end: number; type: RawClaim["type"]; reason: string } };

const MAX_SPAN_WORDS = 30;
const FILLER = new Set(["number", "no"]);
const STATUS_VERBS: Record<NonNullable<RawClaim["status_value"]>, string[]> = {
  set: ["set", "placed", "landed", "positioned"],
  delivered: ["delivered", "arrived", "came in", "received"],
  installed: ["installed", "hooked up", "connected", "energized"],
};
const SPEECH_VERBS = new Set([
  "said",
  "says",
  "told",
  "asked",
  "mentioned",
  "reported",
  "will",
  "wants",
  "confirmed",
  "thinks",
]);
// Words that open "<x> said" without being a name.
const NOT_NAMES = new Set([
  "he",
  "she",
  "they",
  "we",
  "you",
  "it",
  "who",
  "that",
  "which",
  "crew",
  "foreman",
  "engineer",
  "supervisor",
  "vendor",
  "driver",
  "site",
  "team",
  "everyone",
  "nobody",
  "somebody",
  "someone",
]);
const NEGATORS = new Set([
  "not",
  "never",
  "no",
  "cannot",
  "isn't",
  "isnt",
  "wasn't",
  "wasnt",
  "hasn't",
  "hasnt",
  "haven't",
  "havent",
  "didn't",
  "didnt",
  "aren't",
  "arent",
  "weren't",
  "werent",
  "won't",
  "wont",
]);
const NEGATION_REACH = 3;
const CALENDAR = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export function vocabOf(p: Project): Vocab {
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  return {
    tags: uniq([...p.byTag.keys()]),
    locations: uniq([...p.locations]),
    components: uniq(p.poLines.flatMap((l) => l.components)),
    manufacturers: uniq([...p.equipment, ...p.poLines].map((r) => r.manufacturer)),
    activities: p.activities.map((a) => ({ id: a.id, name: a.name, tag: a.tag })),
  };
}

/** Windows of 1..max consecutive tokens. */
function* windows(tokens: Token[], max: number): Generator<Token[]> {
  for (let a = 0; a < tokens.length; a++)
    for (let n = 1; n <= max && a + n <= tokens.length; n++) yield tokens.slice(a, a + n);
}

/** Which way the value was spoken: null if not at all, else whether folding was needed. */
export function spokenAs(tokens: Token[], value: string, norm: (s: string) => string, max = 4) {
  const content = tokens.filter((x) => !FILLER.has(x.t));
  for (const w of windows(content, max)) {
    if (norm(w.map((x) => x.t).join(" ")) === value) return { folded: w.some((x) => x.folded) };
  }
  return null;
}

/** Index of the first occurrence of the phrase, or -1. */
function phraseAt(tokens: Token[], phrase: string): number {
  const p = foldSpoken(phrase.split(/\s+/));
  const t = tokens.map((x) => x.t);
  return t.findIndex((_, a) => p.every((x, k) => t[a + k] === x));
}

const hasPhrase = (tokens: Token[], phrase: string) => phraseAt(tokens, phrase) >= 0;

/** "not set", "hasn't arrived": a negator within a few tokens before the verb. */
const negated = (tokens: Token[], at: number) =>
  tokens.slice(Math.max(0, at - NEGATION_REACH), at).some((x) => NEGATORS.has(x.t));

export function hasDelay(tokens: Token[], days: number): boolean {
  return tokens.some((x, k) => {
    const unit = tokens[k + 1]?.t ?? "";
    if (unit.startsWith("day")) return x.t === String(days);
    if (unit.startsWith("week")) return (x.t === "a" ? 1 : Number(x.t)) * 7 === days;
    return false;
  });
}

export function activitySpoken(tokens: Token[], a: Vocab["activities"][number]): boolean {
  if (a.tag && spokenAs(tokens, a.tag, normalizeTag)) return true;
  const have = new Set(tokens.map((x) => x.t));
  return foldSpoken(a.name.split(/\s+/)).every((x) => have.has(x));
}

function roleSpoken(tokens: Token[], role: string): boolean {
  const compact = role.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  for (const w of windows(tokens, 4)) if (w.map((x) => x.t).join("") === compact) return true;
  return false;
}

/** Keep a claim only if the words inside its span say every key value it carries. */
export function ground(c: RawClaim, words: Word[], vocab: Vocab, audio: string): GroundResult {
  const drop = (reason: string): GroundResult => ({
    dropped: { word_start: c.word_start, word_end: c.word_end, type: c.type, reason },
  });
  const { word_start: s, word_end: e } = c;
  if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e < s || e >= words.length)
    return drop("bad_span");
  if (e - s + 1 > MAX_SPAN_WORDS) return drop("span_too_long");
  const span = words.slice(s, e + 1);
  const tokens = foldTokens(span.map((w) => w.text));
  let exact = true;

  if (c.tag !== null) {
    const m = spokenAs(tokens, c.tag, normalizeTag);
    if (!m) return drop("tag_not_in_span");
    exact &&= !m.folded;
  }
  if (c.location !== null) {
    const m = spokenAs(tokens, c.location, normalizeLocation, 3);
    if (!m) return drop("location_not_in_span");
    exact &&= !m.folded;
  }
  // The activity is the fact only for a date change; elsewhere an unspoken one is cleared, like an owner.
  let activity = c.activity_id;
  if (activity !== null) {
    const a = vocab.activities.find((x) => x.id === activity);
    if (!a || !activitySpoken(tokens, a)) {
      if (c.type === "date_change") return drop("activity_not_in_span");
      activity = null;
    }
  }
  if (c.delay_days !== null && !hasDelay(tokens, c.delay_days)) return drop("number_not_in_span");
  if (c.component !== null && !hasPhrase(tokens, c.component)) return drop("component_not_in_span");
  let doubt: GroundedClaim["doubt"] = null;
  if (c.type === "status") {
    const verbs = c.status_value ? STATUS_VERBS[c.status_value] : [];
    const at = verbs.map((v) => phraseAt(tokens, v)).filter((i) => i >= 0);
    if (at.length === 0) return drop("verb_not_in_span");
    if (at.every((i) => negated(tokens, i))) doubt = "negated";
  }
  // A long span that names other units or places too: the claim could belong to any of them.
  const named = (values: string[], norm: (s: string) => string, max?: number) =>
    values.filter((v) => spokenAs(tokens, v, norm, max)).length;
  if (
    (c.tag !== null && named(vocab.tags, normalizeTag) > 1) ||
    (c.location !== null && named(vocab.locations, normalizeLocation, 3) > 1)
  )
    doubt = "ambiguous_span";
  const owner =
    c.owner_role !== null &&
    ActorId.safeParse(c.owner_role).success &&
    roleSpoken(tokens, c.owner_role)
      ? c.owner_role
      : null;

  const first = span[0]!;
  const last = span.at(-1)!;
  return {
    claim: {
      ...c,
      owner_role: owner,
      activity_id: activity,
      exact,
      doubt,
      span: {
        kind: "audio_span",
        ref: `${audio}@${first.start.toFixed(1)}-${last.end.toFixed(1)}`,
        quote: span.map((w) => w.text).join(" "),
      },
    },
  };
}

const letters = (s: string) => s.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");

/**
 * People's names in a transcript: a word that is not project vocabulary or a calendar word,
 * either right before a speech verb ("ravi said", any case) or capitalized mid-sentence
 * (Whisper capitalizes proper nouns when it punctuates). The extractor flags the rest.
 */
export function findNames(words: Word[], vocab: Vocab): Set<string> {
  const allow = new Set([
    ...CALENDAR,
    "i",
    "generator",
    "transformer",
    ...[...vocab.tags, ...vocab.locations, ...vocab.components, ...vocab.manufacturers]
      .concat(vocab.activities.map((a) => a.name))
      .flatMap((s) => s.toLowerCase().split(/[^a-z0-9]+/)),
  ]);
  const names = new Set<string>();
  words.forEach((w, k) => {
    const core = letters(w.text);
    const lc = core.toLowerCase();
    if (!/^[a-z]+$/i.test(core) || allow.has(lc) || NOT_NAMES.has(lc)) return;
    // Whisper may write the whole note in lower case: "<x> said" counts whatever the case.
    const beforeSpeech = SPEECH_VERBS.has(cleanWord(words[k + 1]?.text ?? ""));
    const opensSentence = k === 0 || /[.!?]$/.test(words[k - 1]!.text);
    const midCapital = /^[A-Z][a-z]+$/.test(core) && !opensSentence;
    if (beforeSpeech || midCapital) names.add(lc);
  });
  return names;
}

export const redactNames = (words: Word[], names: Set<string>): Word[] =>
  words.map((w) => (names.has(letters(w.text).toLowerCase()) ? { ...w, text: "[name]" } : w));

export const scrubNames = (text: string, names: Set<string>): string =>
  text
    .replace(/\b[A-Za-z]+\b/g, (m) => (names.has(m.toLowerCase()) ? "" : m))
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
