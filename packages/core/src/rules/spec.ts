import type { Citation } from "@bankai/schemas";
import { cite } from "../cite";
import { check, observed, type Rule } from "./context";

const KVA_TOLERANCE = 0.05;

/** First number in a rating: "415/240V" gives 415, "11kV" gives 11000. */
export function firstNumber(raw: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(k)?/i.exec(raw);
  if (!m) return null;
  return Number(m[1]) * (m[2] ? 1000 : 1);
}

export const spec: Rule = (ctx) => {
  const tag = ctx.tag!;
  const po = ctx.project.poByTag.get(tag);
  const row = ctx.project.byTag.get(tag);
  if (!po) return check("spec", "unknown", "no_po_line");

  const problems: string[] = [];
  const citations: Citation[] = [cite.poLine(po)];
  let compared = 0;
  const compare = (
    field: "voltage" | "frequency" | "phase" | "kva" | "kw",
    expected: number | null,
    atLeast = false,
  ) => {
    const o = observed(ctx, field);
    const got = o ? firstNumber(o.value) : null;
    if (!o || got === null || expected === null) return;
    compared++;
    citations.push(o.evidence);
    const ok = atLeast ? got >= expected * (1 - KVA_TOLERANCE) : got === expected;
    if (!ok) problems.push(`${field}: expected ${expected}, nameplate ${o.value}`);
  };

  compare("voltage", firstNumber(po.voltage));
  compare("kva", po.kva, true);
  compare("kw", po.kw, true);
  // The PO has no phase or frequency; the equipment schedule row does.
  if (row) {
    const before = compared;
    compare("phase", row.phase);
    compare("frequency", row.frequency);
    if (compared > before) citations.push(cite.equipmentRow(row.tag));
  }

  if (compared === 0) return check("spec", "unknown", "no_ratings_read", citations);
  if (problems.length) return check("spec", "fail", problems.join("; "), citations);
  return check("spec", "pass", "ratings_match", citations);
};
