import { cite } from "../cite";
import { normalizeLocation } from "../link/normalize";
import { check, type Rule } from "./context";

export const location: Rule = (ctx) => {
  if (ctx.location === null) return check("location", "unknown", "no_location_given");
  const where = normalizeLocation(ctx.location);
  if (!ctx.project.locations.has(where))
    return check("location", "unknown", "location_not_in_project");
  const row = ctx.project.byTag.get(ctx.tag!);
  if (!row) return check("location", "unknown", "no_designed_location");
  const citations = [cite.equipmentRow(row.tag), cite.drawing(row.drawing, row.revision)];
  if (normalizeLocation(row.location) === where)
    return check("location", "pass", "at_designed_location", citations);
  return check(
    "location",
    "fail",
    `belongs at ${row.location} (${row.drawing} rev ${row.revision})`,
    citations,
  );
};
