import { expect, test } from "bun:test";
import type { Verdict } from "@bankai/schemas";
import { formatVerdict } from "../src/format";

test("control characters from data never reach the terminal", () => {
  const ESC = String.fromCharCode(27);
  const v: Verdict = {
    id: "v",
    subject_tag: `GEN-3${ESC}[2J`,
    status: "flagged",
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
  expect(out.split("\n")).toHaveLength(3);
});
