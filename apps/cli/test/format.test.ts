import { expect, test } from "bun:test";
import type { Verdict } from "@bankai/schemas";

// Color is decided when the module loads; turn it off so only data could carry ESC.
process.env.NO_COLOR = "1";
const { formatVerdict } = await import("../src/format");

const base: Verdict = {
  id: "v",
  subject_tag: "GEN-3",
  status: "flagged",
  install_readiness: { status: "blocked", blockers: ["location", "revision"] },
  checks: [],
  confidence: 0.9,
  retake_request: null,
  candidates: [],
  models: ["m"],
  cost_usd: 0,
  latency_ms: 0,
};

test("install readiness shows with its blockers", () => {
  expect(formatVerdict(base)).toContain("install: blocked (location, revision)");
  const ready: Verdict = { ...base, install_readiness: { status: "ready", blockers: [] } };
  expect(formatVerdict(ready)).toContain("install: ready\n");
});

test("control characters from data never reach the terminal", () => {
  const ESC = String.fromCharCode(27);
  const v: Verdict = {
    id: "v",
    subject_tag: `GEN-3${ESC}[2J`,
    status: "flagged",
    install_readiness: { status: "unknown", blockers: [] },
    checks: [
      {
        name: "spec",
        result: "fail",
        reason: `bad\rvalue${ESC}]0;x`,
        citations: [{ kind: "po_line", ref: "PO\n1" }],
        range: null,
      },
    ],
    confidence: 0.9,
    retake_request: null,
    candidates: [],
    models: ["m"],
    cost_usd: 0,
    latency_ms: 0,
  };
  const out = formatVerdict(v);
  expect(out).not.toContain(ESC);
  expect(out).not.toContain("\r");
  expect(out.split("\n")).toHaveLength(4);
});
