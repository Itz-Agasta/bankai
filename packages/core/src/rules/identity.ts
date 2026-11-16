import { cite } from "../cite";
import { check, type Rule } from "./context";

export const identity: Rule = (ctx) => {
  if (ctx.tag === null) return check("identity", "unknown", "no_link");
  const row = ctx.project.byTag.get(ctx.tag);
  if (row) return check("identity", "pass", "linked", [cite.equipmentRow(row.tag)]);
  const po = ctx.project.poByTag.get(ctx.tag);
  if (po) return check("identity", "pass", "linked", [cite.poLine(po)]);
  return check("identity", "fail", "not_in_project");
};
