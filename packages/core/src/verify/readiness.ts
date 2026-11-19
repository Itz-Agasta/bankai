import type { Check, CheckName, InstallReadiness, Status } from "@bankai/schemas";

const GATING: CheckName[] = [
  "identity",
  "spec",
  "substitution",
  "location",
  "revision",
  "completeness",
];

/** Can it go in: ready only when every gating check passed, never more than the verdict claims. */
export function installReadiness(status: Status, checks: Check[]): InstallReadiness {
  if (status === "needs_human") return { status: "unknown", blockers: [] };
  const result = (n: CheckName) => checks.find((c) => c.name === n)?.result ?? "unknown";
  const blockers = GATING.filter((n) => result(n) === "fail");
  if (blockers.length) return { status: "blocked", blockers };
  return { status: GATING.every((n) => result(n) === "pass") ? "ready" : "unknown", blockers };
}
