import { describe, expect, test } from "bun:test";
import { Check, Citation, DeliveryLine, NoteResult, PoLine, ProposedUpdate, Verdict } from "../src";

const cite = { kind: "po_line", ref: "PO-1042#14" } as const;

const verdict = {
  id: "v1",
  subject_tag: "GEN-3",
  status: "confirmed",
  checks: [
    { name: "identity", result: "pass", reason: "tag_match", citations: [cite], range: null },
  ],
  confidence: 0.92,
  retake_request: null,
  candidates: [],
  models: ["gemini"],
  cost_usd: 0.002,
  latency_ms: 1800,
};

const update = {
  id: "u1",
  target: cite,
  field: "status",
  old: "ordered",
  new: "delivered",
  evidence: [cite],
  confidence: 0.8,
  approval: "pending",
  approved_by: null,
  at: null,
};

describe("schemas", () => {
  test("a valid verdict parses", () => {
    expect(Verdict.safeParse(verdict).success).toBe(true);
  });

  test("a check result outside pass/fail/unknown is rejected", () => {
    const bad = { name: "spec", result: "maybe", reason: "x", citations: [], range: null };
    expect(Check.safeParse(bad).success).toBe(false);
  });

  test("a gps citation kind is rejected", () => {
    expect(Citation.safeParse({ kind: "gps", ref: "12.9,77.5" }).success).toBe(false);
  });

  test("po line components must be an array", () => {
    const line = {
      po: "PO-1042",
      line: 14,
      tag: "GEN-3",
      manufacturer: "Cummins",
      model: "C2000D6",
      voltage: "415",
      kva: 2000,
      kw: null,
      components: "cabinet",
      qty: 1,
    };
    expect(PoLine.safeParse(line).success).toBe(false);
    expect(PoLine.safeParse({ ...line, components: ["cabinet"] }).success).toBe(true);
  });

  test("delivery driver must be a role id, not a name", () => {
    const line = {
      ticket: "DT-88",
      line: 1,
      po: "PO-1042",
      tag: "GEN-3",
      item: "generator",
      qty: 1,
    };
    expect(DeliveryLine.safeParse({ ...line, driver_id: "Ramesh Kumar" }).success).toBe(false);
    expect(DeliveryLine.safeParse({ ...line, driver_id: "DRV-17" }).success).toBe(true);
  });

  test("a proposed update needs a confidence", () => {
    expect(ProposedUpdate.safeParse(update).success).toBe(true);
    const { confidence: _, ...noConfidence } = update;
    expect(ProposedUpdate.safeParse(noConfidence).success).toBe(false);
  });

  test("a note result needs a cost", () => {
    const note = {
      id: "n1",
      claims: [],
      updates: [update],
      status: "needs_human",
      confidence: 0.4,
      models: [],
      latency_ms: 10,
    };
    expect(NoteResult.safeParse({ ...note, cost_usd: 0 }).success).toBe(true);
    expect(NoteResult.safeParse(note).success).toBe(false);
  });
});
