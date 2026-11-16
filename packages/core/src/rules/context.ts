import type { Check, CheckName, Citation, Field, Observation } from "@bankai/schemas";
import { reading } from "../readings";
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

/** The agreed reading of a field; undefined if unread or readings disagree. */
export const observed = (ctx: RuleContext, field: Field): Observation | undefined =>
  reading(ctx.observations, field);
