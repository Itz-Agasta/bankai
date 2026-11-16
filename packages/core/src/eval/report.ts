import type { EvalResult } from "./types";

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

/** EVAL_REPORT.md: only what the run measured (honest numbers rule). */
export function renderReport(r: EvalResult, meta: { set?: string; at?: string } = {}): string {
  const kinds = new Map<string, { n: number; ok: number }>();
  for (const c of r.cases) {
    const k = kinds.get(c.kind) ?? { n: 0, ok: 0 };
    k.n++;
    if (c.correct) k.ok++;
    kinds.set(c.kind, k);
  }
  const wrong = r.cases.filter((c) => !c.correct);
  return [
    "# Bankai eval report",
    "",
    `Set: \`${meta.set ?? "?"}\` | ${r.cases.length} scenarios, ${r.fields.length} labelled fields | ${r.noCrop ? "full photo (no crop)" : "nameplate crop"} | ${meta.at ?? new Date().toISOString()}`,
    `Models: ${r.models.join(", ") || "none"}`,
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Verdict accuracy | ${pct(r.verdictAccuracy)} |`,
    `| Selective accuracy (answered cases) | ${pct(r.selectiveAccuracy)} |`,
    `| Coverage (not handed to a human) | ${pct(r.coverage)} |`,
    `| Field accuracy | ${pct(r.fieldAccuracy)} |`,
    `| Fabricated records | ${r.fabricated} |`,
    `| Cost, whole run | $${r.costUsd.toFixed(4)} |`,
    `| Mean latency per case | ${(r.meanLatencyMs / 1000).toFixed(1)} s |`,
    "",
    "## By scenario kind",
    "",
    "| Kind | Correct |",
    "|---|---|",
    ...[...kinds.entries()].sort().map(([k, v]) => `| ${k} | ${v.ok}/${v.n} |`),
    "",
    ...(wrong.length
      ? [
          "## Wrong cases",
          "",
          ...wrong.map(
            (c) =>
              `- \`${c.id}\`: expected ${c.expected.status} ${c.expected.subject_tag ?? "-"}, got ${c.actual.status} ${c.actual.subject_tag ?? "-"} (${
                c.actual.checks
                  .filter((x) => x.result === "fail")
                  .map((x) => x.name)
                  .join(", ") || "no failing checks"
              })`,
          ),
          "",
        ]
      : []),
  ].join("\n");
}
