import type { Citation } from "@bankai/schemas";
import { BankaiFailure } from "./errors";
import type { Project } from "./project/types";

/** Split at the first `sep`: `PO-1042#L14` gives `["PO-1042", "L14"]`. */
function split(ref: string, sep: string, last = false): [string, string] | null {
  const i = last ? ref.lastIndexOf(sep) : ref.indexOf(sep);
  return i > 0 && i + sep.length < ref.length ? [ref.slice(0, i), ref.slice(i + sep.length)] : null;
}

const lineOf = (s: string) => (/^L\d+$/.test(s) ? Number(s.slice(1)) : NaN);

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
    case "po_line": {
      const s = split(ref, "#");
      return s ? p.poLines.find((l) => l.po === s[0] && l.line === lineOf(s[1])) : undefined;
    }
    case "delivery_line": {
      const s = split(ref, "#");
      return s ? p.deliveries.find((d) => d.ticket === s[0] && d.line === lineOf(s[1])) : undefined;
    }
    case "drawing": {
      const s = split(ref, "@rev");
      return s ? p.drawings.find((d) => d.drawing === s[0] && d.revision === s[1]) : undefined;
    }
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
