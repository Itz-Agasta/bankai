import { describe, expect, test } from "bun:test";
import type { Check, CheckName } from "@bankai/schemas";
import { installReadiness } from "../src/verify";

const check = (name: CheckName, result: Check["result"]): Check => ({
  name,
  result,
  reason: "r",
  citations: [],
  range: null,
});

const GATING: CheckName[] = [
  "identity",
  "spec",
  "substitution",
  "location",
  "revision",
  "completeness",
];
const allPass = () => GATING.map((n) => check(n, "pass"));
const withResult = (name: CheckName, result: Check["result"]) =>
  allPass().map((c) => (c.name === name ? check(name, result) : c));

describe("installReadiness", () => {
  test("every gating check passing is ready", () => {
    expect(installReadiness("confirmed", allPass())).toEqual({ status: "ready", blockers: [] });
  });

  test("a failed check blocks and is named", () => {
    expect(installReadiness("flagged", withResult("revision", "fail"))).toEqual({
      status: "blocked",
      blockers: ["revision"],
    });
  });

  test("a right unit in the wrong place is blocked on location", () => {
    expect(installReadiness("flagged", withResult("location", "fail")).blockers).toEqual([
      "location",
    ]);
  });

  test("every failed check is listed", () => {
    const checks = allPass().map((c) =>
      c.name === "spec" || c.name === "completeness" ? check(c.name, "fail") : c,
    );
    expect(installReadiness("flagged", checks).blockers).toEqual(["spec", "completeness"]);
  });

  test("an unjudged check is unknown, never ready", () => {
    expect(installReadiness("confirmed", withResult("substitution", "unknown"))).toEqual({
      status: "unknown",
      blockers: [],
    });
  });

  test("a missing check is unknown", () => {
    expect(installReadiness("confirmed", allPass().slice(1)).status).toBe("unknown");
  });

  test("needs_human is unknown even with a fail", () => {
    expect(installReadiness("needs_human", withResult("spec", "fail"))).toEqual({
      status: "unknown",
      blockers: [],
    });
  });

  test("schedule impact neither blocks nor is required", () => {
    expect(
      installReadiness("confirmed", [...allPass(), check("schedule_impact", "fail")]).status,
    ).toBe("ready");
  });

  test("delivery: completeness fail with the rest unknown is blocked", () => {
    const checks = GATING.map((n) => check(n, n === "completeness" ? "fail" : "unknown"));
    expect(installReadiness("flagged", checks)).toEqual({
      status: "blocked",
      blockers: ["completeness"],
    });
  });
});
