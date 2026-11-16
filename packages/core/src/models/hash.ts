/** sha256 over length-prefixed parts, so ("ab", "c") and ("a", "bc") differ. */
export function sha256Hex(...parts: (string | Uint8Array)[]): string {
  const h = new Bun.CryptoHasher("sha256");
  for (const p of parts) {
    const bytes = typeof p === "string" ? new TextEncoder().encode(p) : p;
    h.update(`${bytes.length}:`);
    h.update(bytes);
  }
  return h.digest("hex");
}
