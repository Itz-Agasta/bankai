const TAG_ALIASES: Record<string, string> = {
  GENERATOR: "GEN",
  G: "GEN",
  TRANSFORMER: "TX",
  XFMR: "TX",
};

const collapse = (raw: string) =>
  raw
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "-");

/** "Generator 3", "G-3", "gen3" all give "GEN-3". */
export function normalizeTag(raw: string): string {
  const s = collapse(raw);
  const m = /^([A-Z]+)-?(\d+[A-Z]?)$/.exec(s);
  if (!m) return s;
  const [, prefix, num] = m;
  return `${TAG_ALIASES[prefix!] ?? prefix}-${num}`;
}

/** "pad b " gives "PAD-B". */
export function normalizeLocation(raw: string): string {
  return collapse(raw);
}

/** "C2000 D6" gives "C2000D6". */
export function normalizeModel(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-/.]+/g, "");
}
