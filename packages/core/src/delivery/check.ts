import type { Check, Citation, Verdict, VerifyResult } from "@bankai/schemas";
import calibrator from "../../calibrator.json";
import { cite } from "../cite";
import { BankaiFailure } from "../errors";
import type { CallCost } from "../models/types";
import { loadImage } from "../perceive";
import { runRules } from "../rules";
import { missingComponents } from "../rules/completeness";
import { citeOrDrop, dropUncited } from "../verify/drop-uncited";
import { proposeForDelivery } from "../verify/proposals";
import { decideStatus } from "../verify/status";
import { verifyEquipment, type VerifyDeps } from "../verify/verify";

export interface DeliveryInput {
  po: string;
  line?: number;
  ticket?: string;
  photos?: string[];
}

// Completeness reads "nothing observed" as unknown; nothing delivered is a known fail.
const NOTHING_RECEIVED = "(nothing received)";

const withCitations = (checks: Check[], extra: Citation[]): Check[] =>
  checks.map((c) =>
    c.name === "completeness" ? { ...c, citations: [...c.citations, ...extra] } : c,
  );

/** Delivery tickets against the PO line, plus whatever the photos show. */
export async function checkDelivery(input: DeliveryInput, deps: VerifyDeps): Promise<VerifyResult> {
  const { project } = deps;
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
  const po = lines[0]!;

  const deliveries = project.deliveries.filter(
    (d) =>
      d.po === po.po &&
      d.tag === po.tag &&
      (input.ticket === undefined || d.ticket === input.ticket),
  );
  const received = deliveries.map((d) => d.item);
  const ticketCites = deliveries.map(cite.deliveryLine);

  let verdict: Verdict;
  let observed = received;
  if (input.photos?.length) {
    const { primary } = deps.models;
    if (!primary.components)
      throw new BankaiFailure("PERCEPTION_UNAVAILABLE", "vision model cannot list components");
    const seen: string[] = [];
    const costs: CallCost[] = [];
    for (const photo of input.photos) {
      const img = await loadImage(photo);
      const r = await primary.components(img, po.components);
      deps.tracer.step("components", img, r.value.join(", ") || "none", r.cost);
      seen.push(...r.value);
      costs.push(r.cost);
    }
    observed = [...new Set([...received, ...seen])];
    const v = await verifyEquipment(
      { photos: input.photos, location: null, observedComponents: observed },
      deps,
    );
    verdict = dropUncited({
      ...v,
      checks: withCitations(v.checks, ticketCites),
      models: [...new Set([...v.models, ...costs.map((c) => c.model)])],
      cost_usd: costs.reduce((sum, c) => sum + c.usd, v.cost_usd),
      latency_ms: costs.reduce((sum, c) => sum + c.ms, v.latency_ms),
    });
  } else {
    const checks = citeOrDrop(
      withCitations(
        runRules({
          project,
          tag: po.tag,
          observations: [],
          location: null,
          observedComponents: received.length ? received : [NOTHING_RECEIVED],
        }),
        ticketCites,
      ),
    );
    // Records only, no perception: nothing for confidence to doubt.
    verdict = {
      id: deps.runId ?? crypto.randomUUID(),
      subject_tag: po.tag,
      status: decideStatus(checks, 1, calibrator.threshold),
      checks,
      confidence: 1,
      retake_request: null,
      candidates: [],
      models: [],
      cost_usd: 0,
      latency_ms: 0,
    };
  }
  deps.tracer.step("decide", verdict.id, `delivery ${po.po}#L${po.line} ${verdict.status}`);
  return {
    verdict,
    proposed_updates: proposeForDelivery(verdict, po, observed, missingComponents(po, observed)),
  };
}
