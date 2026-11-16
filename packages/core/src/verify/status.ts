import type { Check, Status } from "@bankai/schemas";

/** Rules decide; confidence only decides whether we dare say so. */
export function decideStatus(checks: Check[], confidence: number, threshold: number): Status {
  if (checks.find((c) => c.name === "identity")?.result !== "pass") return "needs_human";
  if (confidence < threshold) return "needs_human";
  return checks.some((c) => c.result === "fail") ? "flagged" : "confirmed";
}
