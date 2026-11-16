import type { PoLine } from "@bankai/schemas";
import { cite } from "../cite";
import { check, type Rule } from "./context";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** PO components not among `observed`, compared case and space insensitive. */
export function missingComponents(po: PoLine, observed: string[]): string[] {
  const seen = new Set(observed.map(norm));
  return po.components.filter((c) => !seen.has(norm(c)));
}

export const completeness: Rule = (ctx) => {
  const po = ctx.project.poByTag.get(ctx.tag!);
  if (!po) return check("completeness", "unknown", "no_po_line");
  if (po.components.length === 0)
    return check("completeness", "unknown", "no_components_on_po", [cite.poLine(po)]);
  if (ctx.observedComponents.length === 0)
    return check("completeness", "unknown", "components_not_observed");
  const missing = missingComponents(po, ctx.observedComponents);
  if (missing.length)
    return check("completeness", "fail", `missing: ${missing.join(", ")}`, [cite.poLine(po)]);
  return check("completeness", "pass", "all_components_seen", [cite.poLine(po)]);
};
