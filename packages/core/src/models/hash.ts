export function sha256Hex(...parts: (string | Uint8Array)[]): string {
  const h = new Bun.CryptoHasher("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex");
}
