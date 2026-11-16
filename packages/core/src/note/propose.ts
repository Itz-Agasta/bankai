import type { Check, Citation, ProposedUpdate } from "@bankai/schemas";
import { cite } from "../cite";
import { normalizeLocation } from "../link/normalize";
import type { Project } from "../project/types";
import { location as locationRule } from "../rules/location";
import { revision as revisionRule } from "../rules/revision";
import { impactOf } from "../rules/schedule-impact";
import type { GroundedClaim } from "./ground";
import type { ClaimLink } from "./link";

export type DraftUpdate = Omit<ProposedUpdate, "confidence">;

export interface ClaimOutcome {
  checks: Check[];
  update: DraftUpdate | null;
  /** Why a person must settle this claim; null when rules could. */
  needsHuman: "unknown_record" | "date_not_convertible" | "component_not_on_po" | null;
}

const none = (needsHuman: ClaimOutcome["needsHuman"], checks: Check[] = []): ClaimOutcome => ({
  checks,
  update: null,
  needsHuman,
});

/** Rules propose, never the model (D15). One proposal at most per claim. */
export function proposeForClaim(
  c: GroundedClaim,
  link: ClaimLink,
  p: Project,
  noteId: string,
  /** Stable per claim (from its content), so ids survive a re-run that reorders claims. */
  key: string,
): ClaimOutcome {
  if (link.unknown) return none("unknown_record");
  const draft = (
    target: Citation,
    field: string,
    old: string,
    next: string,
    checks: Check[] = [],
  ): ClaimOutcome => ({
    checks,
    needsHuman: null,
    update: {
      id: `upd_${noteId}_${key}`,
      target,
      field,
      old,
      new: next,
      evidence: [c.span, ...link.links],
      approval: "pending",
      approved_by: null,
      at: null,
    },
  });
  const po = c.tag ? p.poByTag.get(c.tag) : undefined;

  switch (c.type) {
    case "status": {
      if (c.status_value === "delivered") {
        if (!po) return none("unknown_record");
        return draft(cite.poLine(po), "delivery_status", "", "delivered");
      }
      const row = c.tag ? p.byTag.get(c.tag) : undefined;
      if (!row || !c.status_value) return none("unknown_record");
      if (c.location === null)
        return draft(cite.equipmentRow(row.tag), "install_status", "", c.status_value);
      const where = normalizeLocation(c.location);
      const ctx = {
        project: p,
        tag: row.tag,
        observations: [],
        location: where,
        observedComponents: [],
      };
      const checks = [locationRule(ctx), revisionRule(ctx)];
      if (checks.some((k) => k.result === "fail")) return none(null, checks);
      if (checks.some((k) => k.result === "unknown")) return none("unknown_record", checks);
      return draft(
        cite.equipmentRow(row.tag),
        "install_status",
        "",
        `${c.status_value} at ${where}`,
        checks,
      );
    }
    case "date_change": {
      if (c.delay_days === null) return none("date_not_convertible");
      const a = link.activity ? p.activityById.get(link.activity) : undefined;
      if (!a) return none("unknown_record");
      const d = c.delay_days;
      const impact = impactOf(p.activities, [a], { low: d, likely: d, high: d, unit: "days" });
      const old = a.delay_days ?? 0;
      return draft(cite.activity(a.id), "delay_days", String(old), String(old + d), [impact]);
    }
    case "issue": {
      if (!po) return none("unknown_record");
      if (c.component !== null && !po.components.includes(c.component))
        return none("component_not_on_po");
      const what = [c.component, c.issue_kind ?? "issue"].filter(Boolean).join(" ");
      return draft(cite.poLine(po), "issues", "", what);
    }
    case "decision":
      return draft({ kind: "decision", ref: `decisions.json#new-${key}` }, "text", "", c.text);
    case "action_item":
      return draft(
        { kind: "action_item", ref: `actions.json#new-${key}` },
        "text",
        "",
        // The model often opens the text with the owner already.
        c.owner_role && c.text.startsWith(c.owner_role)
          ? c.text
          : `${c.owner_role ?? "unassigned"}: ${c.text}`,
      );
  }
}
