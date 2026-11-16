import type { Check, NoteRun, Verdict } from "@bankai/schemas";

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

/** Model and project text is data: no control character (ESC, CR, LF) may reach the terminal. */
export const safe = (s: string) =>
  [...s].map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch)).join("");

/** One line per check with its reason and sources, then the bill. */
export function formatVerdict(raw: Verdict): string {
  const v: Verdict = {
    ...raw,
    subject_tag: raw.subject_tag === null ? null : safe(raw.subject_tag),
    candidates: raw.candidates.map(safe),
    models: raw.models.map(safe),
    retake_request: raw.retake_request && {
      region: safe(raw.retake_request.region),
      why: safe(raw.retake_request.why),
    },
    checks: raw.checks.map((c) => ({
      ...c,
      reason: safe(c.reason),
      citations: c.citations.map((x) => ({ ...x, ref: safe(x.ref) })),
    })),
  };
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

const span = (ref: string) => ref.slice(ref.lastIndexOf("@") + 1);

/** Status line, one line per claim with its time span, pending updates, dropped count, then the bill. */
export function formatNote(run: NoteRun): string {
  const r = run.result;
  const lines = [`${STATUS[r.status]}  ${safe(r.id)}  confidence ${r.confidence}`];
  for (const c of r.claims) {
    lines.push(safe(`  [${span(c.span.ref)}] ${c.type} ${c.text} (${c.confidence})`));
    // Why a note is flagged: each check that did not pass, with its sources.
    for (const k of c.checks.filter((x) => x.result !== "pass")) {
      const refs = k.citations.map((x) => x.ref).join(", ");
      lines.push(
        safe(`      ${MARK[k.result]}  ${k.name} ${k.reason}${refs ? `  [${refs}]` : ""}`),
      );
    }
  }
  if (r.updates.length) lines.push("  proposed updates (need approval):");
  for (const u of r.updates)
    lines.push(safe(`    ${u.id}  ${u.field} on ${u.target.ref}: '${u.old}' -> '${u.new}'`));
  if (run.dropped.length)
    lines.push(`  ${run.dropped.length} claim(s) dropped: not supported by the recording`);
  const bill = `$${r.cost_usd.toFixed(4)}  ${(r.latency_ms / 1000).toFixed(1)}s`;
  lines.push(`  ${r.models.map(safe).join(", ") || "no models"}  ${bill}`);
  return lines.join("\n");
}
