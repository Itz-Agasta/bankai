import { cite } from "../cite";
import { normalizeModel } from "../link/normalize";
import { check, observed, type Rule } from "./context";

const same = (a: string, b: string) => normalizeModel(a) === normalizeModel(b);

export const substitution: Rule = (ctx) => {
  const tag = ctx.tag!;
  const po = ctx.project.poByTag.get(tag);
  const model = observed(ctx, "model");
  const maker = observed(ctx, "manufacturer");
  if (!po) return check("substitution", "unknown", "no_po_line");
  if (!model) return check("substitution", "unknown", "no_model_read");

  const matches = (m: { manufacturer: string; model: string }) =>
    same(model.value, m.model) && (!maker || same(maker.value, m.manufacturer));
  const seen = [model.evidence, ...(maker ? [maker.evidence] : [])];
  if (matches(po)) return check("substitution", "pass", "matches_po", [cite.poLine(po), ...seen]);

  const subs = ctx.project.submittals.filter((s) => s.tag === tag && matches(s));
  const sub =
    subs.find((s) => s.status === "approved" || s.status === "approved_as_noted") ?? subs[0];
  const what = `${maker?.value ?? "?"} ${model.value} instead of ${po.manufacturer} ${po.model}`;
  if (sub && (sub.status === "approved" || sub.status === "approved_as_noted")) {
    return check("substitution", "pass", `${what}, approved in ${sub.id}`, [
      cite.submittal(sub.id),
      ...seen,
    ]);
  }
  const citations = [cite.poLine(po), ...(sub ? [cite.submittal(sub.id)] : []), ...seen];
  return check(
    "substitution",
    "fail",
    `${what}, ${sub ? `${sub.status} in ${sub.id}` : "no approved submittal"}`,
    citations,
  );
};
