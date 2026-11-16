import type { Check, CheckName, Citation, Field, Observation } from "@bankai/schemas";
import type { Project } from "../project/types";

export interface RuleContext {
  project: Project;
  /** Linked tag, or null when linking found no clear winner. */
  tag: string | null;
  observations: Observation[];
  location: string | null;
  observedComponents: string[];
}

export type Rule = (ctx: RuleContext) => Check;

export const check = (
  name: CheckName,
  result: Check["result"],
  reason: string,
  citations: Citation[] = [],
): Check => ({ name, result, reason, citations, range: null });

/** First observation of a field, if any. */
export const observed = (ctx: RuleContext, field: Field): Observation | undefined =>
  ctx.observations.find((o) => o.field === field);
