import { cite } from "../cite";
import { normalizeLocation } from "../link/normalize";
import { check, type Rule } from "./context";
import { location } from "./location";

/** When the unit is in the wrong place, was it placed by a superseded drawing? */
export const revision: Rule = (ctx) => {
  const loc = location(ctx);
  if (loc.result === "unknown") return check("revision", "unknown", loc.reason);
  if (loc.result === "pass") return check("revision", "pass", "current_revision", loc.citations);

  const where = normalizeLocation(ctx.location!);
  const current = ctx.project.byTag.get(ctx.tag!)!;
  for (const old of ctx.project.equipment) {
    // The current row sits elsewhere (location failed), so it never matches `where`.
    if (old.tag !== current.tag || normalizeLocation(old.location) !== where) continue;
    const d = ctx.project.drawings.find(
      (r) => r.drawing === old.drawing && r.revision === old.revision,
    );
    if (!d?.superseded_by) continue;
    const reason = `matches ${d.drawing} rev ${d.revision}, superseded on ${d.superseded_on} by rev ${d.superseded_by}`;
    return check("revision", "fail", reason, [
      cite.drawing(d.drawing, d.revision),
      cite.drawing(d.drawing, d.superseded_by),
    ]);
  }
  return check("revision", "pass", "no_superseded_match", loc.citations);
};
