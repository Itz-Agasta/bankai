import type { Check, PoLine, ProposedUpdate, Verdict } from "@bankai/schemas";
import { cite } from "../cite";
import type { Project } from "../project/types";

export const NOTHING_RECEIVED = "(nothing received)";

const citationsOf = (v: Verdict, ...names: Check["name"][]) =>
  v.checks.filter((c) => names.includes(c.name)).flatMap((c) => c.citations);

const pending = (
  v: Verdict,
  u: Pick<ProposedUpdate, "target" | "field" | "old" | "new" | "evidence">,
): ProposedUpdate => ({
  id: `upd_${v.id}_1`,
  ...u,
  confidence: v.confidence,
  approval: "pending",
  approved_by: null,
  at: null,
});

/** Rules propose, never a model (D15): a confirmed unit whose location check passed can be marked installed. */
export function proposeForVerify(
  v: Verdict,
  location: string | null,
  project: Project,
): ProposedUpdate[] {
  if (v.status !== "confirmed" || !location || !v.subject_tag) return [];
  if (!project.byTag.has(v.subject_tag)) return [];
  if (v.checks.find((c) => c.name === "location")?.result !== "pass") return [];
  return [
    pending(v, {
      target: cite.equipmentRow(v.subject_tag),
      field: "install_status",
      old: "",
      new: `installed at ${location}`,
      evidence: citationsOf(v, "identity", "location"),
    }),
  ];
}

/** A short delivery: record what arrived and what is still owed against the PO line. */
export function proposeForDelivery(
  v: Verdict,
  po: PoLine,
  received: string[],
  missing: string[],
): ProposedUpdate[] {
  if (v.checks.find((c) => c.name === "completeness")?.result !== "fail") return [];
  return [
    pending(v, {
      target: cite.poLine(po),
      field: "received_components",
      old: "",
      new: `${received.join(", ") || NOTHING_RECEIVED}; missing: ${missing.join(", ")}`,
      evidence: citationsOf(v, "completeness"),
    }),
  ];
}
