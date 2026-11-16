import type { Citation } from "@bankai/schemas";
import { cite } from "../cite";
import type { Project } from "../project/types";
import type { GroundedClaim } from "./ground";

export interface ClaimLink {
  links: Citation[];
  /** 1 when every named record exists; grounding already priced in how the name was spoken. */
  score: number;
  /** A tag or activity was named that the project does not hold. */
  unknown: boolean;
  activity: string | null;
}

/** Records the claim names, cited. A tag-only claim gets its activity when the tag has exactly one. */
export function linkClaim(c: GroundedClaim, p: Project): ClaimLink {
  const links: Citation[] = [];
  let unknown = false;
  if (c.tag !== null) {
    const row = p.byTag.get(c.tag);
    const po = p.poByTag.get(c.tag);
    if (row) links.push(cite.equipmentRow(row.tag));
    if (po) links.push(cite.poLine(po));
    if (!row && !po) unknown = true;
  }
  let activity: string | null = null;
  if (c.activity_id !== null) {
    const a = p.activityById.get(c.activity_id);
    // An activity that belongs to another unit than the one named: a person decides.
    if (a && (c.tag === null || a.tag === null || a.tag === c.tag)) activity = c.activity_id;
    else unknown = true;
  } else if (c.tag !== null) {
    const own = p.activities.filter((a) => a.tag === c.tag);
    if (own.length === 1) activity = own[0]!.id;
  }
  if (activity) links.push(cite.activity(activity));
  if (unknown) return { links: [], score: 0, unknown, activity: null };
  return { links, score: 1, unknown, activity };
}
