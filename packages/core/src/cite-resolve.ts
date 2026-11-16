import type { Citation } from "@bankai/schemas";
import { cite } from "./cite";
import { BankaiFailure } from "./errors";
import type { Project } from "./project/types";

/** Split at the first `sep`: `PO-1042#L14` gives `["PO-1042", "L14"]`. */
function split(ref: string, sep: string, last = false): [string, string] | null {
  const i = last ? ref.lastIndexOf(sep) : ref.indexOf(sep);
  return i > 0 && i + sep.length < ref.length ? [ref.slice(0, i), ref.slice(i + sep.length)] : null;
}

/**
 * The record a citation points at, in the ref formats `cite.ts` writes. A submittal id can
 * cover several tags, so it gives every row; a `new-` decision or action is a proposal, so null.
 */
export function resolveCitation(project: Project, c: Citation): unknown {
  const found = lookup(project, c);
  if (found === undefined) throw new BankaiFailure("NOT_FOUND", `no ${c.kind} ${c.ref}`);
  return found;
}

function lookup(p: Project, { kind, ref }: Citation): unknown {
  switch (kind) {
    case "equipment_schedule_row": {
      const s = split(ref, "#");
      return s && s[0] === "equipment_schedule.csv" ? p.byTag.get(s[1]) : undefined;
    }
    case "po_line":
      return p.poLines.find((l) => cite.poLine(l).ref === ref);
    case "delivery_line":
      return p.deliveries.find((d) => cite.deliveryLine(d).ref === ref);
    case "drawing":
      return p.drawings.find((d) => cite.drawing(d.drawing, d.revision).ref === ref);
    case "schedule_activity":
      return p.activityById.get(ref);
    case "submittal": {
      const rows = p.submittals.filter((s) => s.id === ref);
      return rows.length ? rows : undefined;
    }
    case "decision":
    case "action_item": {
      const s = split(ref, "#");
      const file = kind === "decision" ? "decisions.json" : "actions.json";
      if (!s || s[0] !== file) return undefined;
      if (s[1].startsWith("new-")) return null;
      const rows: { id: string }[] = kind === "decision" ? p.decisions : p.actions;
      return rows.find((r) => r.id === s[1]);
    }
    case "photo_region":
    case "audio_span": {
      const s = split(ref, kind === "photo_region" ? "#" : "@", kind === "audio_span");
      return s ? { file: s[0], region: s[1] } : undefined;
    }
  }
}
