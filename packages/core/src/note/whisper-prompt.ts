import type { Vocab } from "./ground";

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const MAX_CHARS = 800; // rough proxy for Whisper's 224-token prompt limit, not a token count

const say = (n: number) =>
  n < 20
    ? ONES[n]!
    : n < 100
      ? `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`
      : String(n);

/** "GEN-3" -> "gen three", so Whisper hears the tag the way people say it. */
const spokenTag = (tag: string) =>
  tag
    .toLowerCase()
    .replace(/-?(\d+)/g, (_, d: string) => ` ${say(Number(d))}`)
    .replace(/-/g, " ")
    .trim();

/** Prime Whisper with the project's own words: tags (written and spoken) and places. */
export function whisperPrompt(v: Vocab): string {
  const parts = [
    ...new Set([...v.tags, ...v.tags.map(spokenTag), ...v.locations, ...v.components]),
  ];
  let out = "";
  for (const p of parts) {
    const next = out ? `${out}, ${p}` : p;
    if (next.length > MAX_CHARS) continue; // a shorter later entry may still fit
    out = next;
  }
  return out;
}
