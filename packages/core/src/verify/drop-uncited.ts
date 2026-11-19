import type { Check, Citation, Verdict } from "@bankai/schemas";
import { installReadiness } from "./readiness";

const unique = (cs: Citation[]): Citation[] => {
  const seen = new Set<string>();
  return cs.filter((c) => {
    const key = `${c.kind}|${c.ref}|${c.quote ?? ""}`;
    return !seen.has(key) && seen.add(key);
  });
};

/** Citation or drop (D16): each source cited once; a pass or fail with nothing to point at becomes unknown. */
export const citeOrDrop = (checks: Check[]): Check[] =>
  checks.map((c) => {
    const citations = unique(c.citations);
    if (c.result !== "unknown" && citations.length === 0)
      return { ...c, result: "unknown", reason: "uncited", citations };
    return { ...c, citations };
  });

/** If dropping a citation-less check changed anything, the old status no longer stands: hand it to a human. Readiness follows the final status. */
export const dropUncited = (v: Omit<Verdict, "install_readiness">): Verdict => {
  const checks = citeOrDrop(v.checks);
  const changed = checks.some((c, i) => c.result !== v.checks[i]?.result);
  const status = changed ? "needs_human" : v.status;
  return { ...v, checks, status, install_readiness: installReadiness(status, checks) };
};
