import type { Check, Verdict } from "@bankai/schemas";

const color = !process.env.NO_COLOR && process.stdout.isTTY;
const ESC = String.fromCharCode(27);
const paint = (code: number, s: string) => (color ? `${ESC}[${code}m${s}${ESC}[0m` : s);

const MARK: Record<Check["result"], string> = {
  pass: paint(32, "PASS"),
  fail: paint(31, "FAIL"),
  unknown: paint(33, "????"),
};

const STATUS: Record<Verdict["status"], string> = {
  confirmed: paint(32, "CONFIRMED"),
  flagged: paint(31, "FLAGGED"),
  needs_human: paint(33, "NEEDS A HUMAN"),
};

/** One line per check with its reason and sources, then the bill. */
export function formatVerdict(v: Verdict): string {
  const lines = [
    `${STATUS[v.status]}  ${v.subject_tag ?? "unidentified"}  confidence ${v.confidence}`,
  ];
  if (v.candidates.length) lines.push(`  candidates: ${v.candidates.join(", ")}`);
  for (const c of v.checks) {
    const refs = c.citations.map((x) => x.ref).join(", ");
    lines.push(`  ${MARK[c.result]}  ${c.name.padEnd(15)} ${c.reason}${refs ? `  [${refs}]` : ""}`);
  }
  if (v.retake_request)
    lines.push(`  retake: ${v.retake_request.region} (${v.retake_request.why})`);
  const bill = `$${v.cost_usd.toFixed(4)}  ${(v.latency_ms / 1000).toFixed(1)}s`;
  lines.push(`  ${v.models.join(", ") || "no models"}  ${bill}`);
  return lines.join("\n");
}
