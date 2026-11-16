import type { Check, Citation, PoLine, Verdict, VerifyResult } from "@bankai/schemas";
import { basename } from "node:path";
import { cite } from "../cite";
import { BankaiFailure } from "../errors";
import type { CallCost, VisionModel } from "../models/types";
import { call, loadImage } from "../perceive";
import type { Project } from "../project/types";
import { runRules } from "../rules";
import { missingComponents } from "../rules/completeness";
import { citeOrDrop } from "../verify/drop-uncited";
import { NOTHING_RECEIVED, proposeForDelivery } from "../verify/proposals";
import type { VerifyDeps } from "../verify/verify";

export interface DeliveryInput {
  po: string;
  line?: number;
  ticket?: string;
  photos?: string[];
}

function findLine(project: Project, input: DeliveryInput): PoLine {
  const lines = project.poLines.filter(
    (l) => l.po === input.po && (input.line === undefined || l.line === input.line),
  );
  if (lines.length === 0) {
    const ref = input.line === undefined ? input.po : `${input.po} line ${input.line}`;
    throw new BankaiFailure("NOT_FOUND", `no PO line ${ref} in this project`);
  }
  if (lines.length > 1)
    throw new BankaiFailure(
      "INPUT_UNSUPPORTED",
      `${input.po} has lines ${lines.map((l) => l.line).join(", ")}; pass line`,
    );
  return lines[0]!;
}

/** Components both model families see in a photo, picked only from the PO's own list. */
async function seenInPhotos(
  photos: string[],
  po: PoLine,
  { models, tracer }: Pick<VerifyDeps, "models" | "tracer">,
  costs: CallCost[],
): Promise<{ seen: string[]; cites: Citation[] }> {
  const ask = (m: VisionModel, img: Uint8Array) =>
    call(() => {
      if (!m.components) throw new Error(`${m.id} cannot list components`);
      return m.components(img, po.components);
    });
  const seen = new Set<string>();
  const cites: Citation[] = [];
  for (const photo of photos) {
    const img = await loadImage(photo);
    const [a, b] = await Promise.all([ask(models.primary, img), ask(models.checker, img)]);
    costs.push(a.cost, b.cost);
    tracer.step("components.primary", img, a.value.join(", ") || "none", a.cost);
    tracer.step("components.checker", img, b.value.join(", ") || "none", b.cost);
    const agreed = a.value.filter((c) => b.value.includes(c));
    agreed.forEach((c) => seen.add(c));
    if (agreed.length) cites.push({ kind: "photo_region", ref: `${basename(photo)}#full` });
  }
  return { seen: [...seen], cites };
}

/**
 * Delivery tickets against one PO line, plus components the photos show.
 * No nameplate needed: the PO line names the unit, so identity comes from the records.
 */
export async function checkDelivery(input: DeliveryInput, deps: VerifyDeps): Promise<VerifyResult> {
  const { project } = deps;
  const po = findLine(project, input);
  const deliveries = project.deliveries.filter(
    (d) =>
      d.po === po.po &&
      d.tag === po.tag &&
      (input.ticket === undefined || d.ticket === input.ticket),
  );
  if (input.ticket !== undefined && deliveries.length === 0)
    throw new BankaiFailure(
      "NOT_FOUND",
      `no lines for ${po.po} line ${po.line} on ticket ${input.ticket}`,
    );

  const costs: CallCost[] = [];
  const photo = input.photos?.length
    ? await seenInPhotos(input.photos, po, deps, costs)
    : { seen: [], cites: [] };
  const observed = [...new Set([...deliveries.map((d) => d.item), ...photo.seen])];
  const extra = [...deliveries.map(cite.deliveryLine), ...photo.cites];

  const checks = citeOrDrop(
    runRules({
      project,
      tag: po.tag,
      observations: [],
      location: null,
      // Completeness reads "nothing observed" as unknown; nothing delivered is a known fail.
      observedComponents: observed.length ? observed : [NOTHING_RECEIVED],
    }).map((c): Check =>
      c.name === "completeness" ? { ...c, citations: [...c.citations, ...extra] } : c,
    ),
  );
  const completeness = checks.find((c) => c.name === "completeness")!;
  const verdict: Verdict = {
    id: deps.runId ?? crypto.randomUUID(),
    subject_tag: po.tag,
    // Only completeness is judged here; the other checks have nothing to look at.
    status:
      completeness.result === "unknown"
        ? "needs_human"
        : completeness.result === "fail"
          ? "flagged"
          : "confirmed",
    checks,
    // Records, plus components two model families agree on.
    confidence: 1,
    retake_request: null,
    candidates: [],
    models: [...new Set(costs.map((c) => c.model))],
    cost_usd: costs.reduce((s, c) => s + c.usd, 0),
    latency_ms: costs.reduce((s, c) => s + c.ms, 0),
  };
  deps.tracer.step("decide", verdict.id, `delivery ${po.po}#L${po.line} ${verdict.status}`);
  return {
    verdict,
    proposed_updates: proposeForDelivery(verdict, po, observed, missingComponents(po, observed)),
  };
}
