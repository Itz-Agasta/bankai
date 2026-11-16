const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** " GEN-3," gives "gen-3": lower case, edge punctuation gone, inner hyphens kept. */
export const cleanWord = (s: string) => s.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");

export interface Token {
  t: string;
  /** True when this token came from a spoken number word ("three" -> "3"). */
  folded: boolean;
}

/** Clean, split on hyphens, and turn number words into digits ("twenty one" -> "21"). */
export function foldTokens(words: string[]): Token[] {
  const raw = words.flatMap((w) => cleanWord(w).split("-")).filter(Boolean);
  const out: Token[] = [];
  for (let k = 0; k < raw.length; k++) {
    const t = raw[k]!;
    const tens = TENS[t];
    const next = ONES[raw[k + 1] ?? ""];
    if (tens !== undefined && next !== undefined && next > 0 && next < 10) {
      out.push({ t: String(tens + next), folded: true });
      k++;
    } else if (tens !== undefined) out.push({ t: String(tens), folded: true });
    else if (ONES[t] !== undefined) out.push({ t: String(ONES[t]), folded: true });
    else out.push({ t, folded: false });
  }
  return out;
}

export const foldSpoken = (words: string[]): string[] => foldTokens(words).map((x) => x.t);
