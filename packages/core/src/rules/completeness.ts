import { cite } from "../cite";
import { check, type Rule } from "./context";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export const completeness: Rule = (ctx) => {
  const po = ctx.project.poByTag.get(ctx.tag!);
  if (!po) return check("completeness", "unknown", "no_po_line");
  if (ctx.observedComponents.length === 0)
    return check("completeness", "unknown", "components_not_observed");
  const seen = new Set(ctx.observedComponents.map(norm));
  const missing = po.components.filter((c) => !seen.has(norm(c)));
  if (missing.length)
    return check("completeness", "fail", `missing: ${missing.join(", ")}`, [cite.poLine(po)]);
  return check("completeness", "pass", "all_components_seen", [cite.poLine(po)]);
};
