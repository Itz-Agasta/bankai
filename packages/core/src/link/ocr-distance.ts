import { normalizeModel } from "./normalize";

// Characters OCR and vision models mix up on nameplates (D12).
const CONFUSABLE = ["O0", "I1", "L1", "S5", "B8", "Z2", "G6"];
const CHEAP = new Set(CONFUSABLE.flatMap(([a, b]) => [`${a}${b}`, `${b}${a}`]));

const subCost = (a: string, b: string) => (a === b ? 0 : CHEAP.has(a + b) ? 0.2 : 1);

/** Weighted Levenshtein on normalized models: confusable swaps cost 0.2, everything else 1. */
export function ocrDistance(rawA: string, rawB: string): number {
  const a = normalizeModel(rawA);
  const b = normalizeModel(rawB);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + subCost(a[i - 1]!, b[j - 1]!),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}
