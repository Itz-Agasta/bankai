import { beforeAll, describe, expect, test } from "bun:test";
import type { Check, CheckName, Field } from "@bankai/schemas";
import type { Project } from "../src/project/types";
import { runRules } from "../src/rules";
import type { RuleContext } from "../src/rules/context";
import { loadMini, obs } from "./helpers";

let mini: Project;
beforeAll(async () => {
  mini = await loadMini();
});

const GEN3 = { manufacturer: "Cummins", model: "C2000D6", voltage: "415V", kva: "2000" };

function run(
  over: Partial<Omit<RuleContext, "observations">> & { fields?: Partial<Record<Field, string>> },
) {
  const { fields = GEN3, ...rest } = over;
  const ctx: RuleContext = {
    project: mini,
    tag: "GEN-3",
    observations: obs(fields),
    location: null,
    observedComponents: [],
    ...rest,
  };
  const checks = runRules(ctx);
  return (name: CheckName): Check => checks.find((c) => c.name === name)!;
}

describe("location and revision", () => {
  test("GEN-3 on the superseded pad", () => {
    const check = run({ location: "PAD-A" });
    expect(check("location")).toMatchObject({
      result: "fail",
      reason: "belongs at PAD-B (E-201 rev C)",
    });
    expect(check("location").citations).toContainEqual({ kind: "drawing", ref: "E-201@revC" });
    expect(check("revision").result).toBe("fail");
    expect(check("revision").reason).toContain("rev B, superseded on 2026-10-02");
  });

  test("loosely typed correct pad passes", () => {
    expect(run({ location: "pad b " })("location").result).toBe("pass");
  });

  test("unknown pad is unknown, not fail", () => {
    expect(run({ location: "Pad Z" })("location")).toMatchObject({
      result: "unknown",
      reason: "location_not_in_project",
    });
  });

  test("a PO-only tag has no designed location", () => {
    const check = run({ tag: "PUMP-9", location: "PAD-B", fields: { tag: "PUMP-9" } });
    expect(check("identity").result).toBe("pass");
    expect(check("location")).toMatchObject({ result: "unknown", reason: "no_designed_location" });
  });
});

describe("spec", () => {
  test("wrong voltage fails", () => {
    expect(run({ fields: { ...GEN3, voltage: "480V" } })("spec").result).toBe("fail");
  });

  test("first number of a dual voltage is compared", () => {
    expect(run({ fields: { ...GEN3, voltage: "415/240V" } })("spec").result).toBe("pass");
  });

  test("kVA within 5 percent passes", () => {
    expect(run({ fields: { ...GEN3, kva: "1950" } })("spec").result).toBe("pass");
  });

  test("kVA more than 5 percent low fails", () => {
    expect(run({ fields: { ...GEN3, kva: "1800" } })("spec").result).toBe("fail");
  });

  test("cites the PO line", () => {
    expect(run({})("spec").citations).toContainEqual({ kind: "po_line", ref: "PO-1042#L14" });
  });

  test("no ratings read is unknown", () => {
    expect(run({ fields: { manufacturer: "Cummins" } })("spec")).toMatchObject({
      result: "unknown",
      reason: "no_ratings_read",
    });
  });
});

describe("substitution", () => {
  test("a rejected substitute fails citing its submittal", () => {
    const check = run({ tag: "CRAH-2", fields: { manufacturer: "Stulz", model: "CyberAir 3" } })(
      "substitution",
    );
    expect(check.result).toBe("fail");
    expect(check.citations).toContainEqual({ kind: "submittal", ref: "SUB-12" });
  });

  test("the PO make and model pass", () => {
    expect(run({})("substitution").result).toBe("pass");
  });
});

describe("completeness", () => {
  test("a missing controls cabinet fails", () => {
    const check = run({ observedComponents: ["generator", "day tank"] })("completeness");
    expect(check.result).toBe("fail");
    expect(check.reason).toContain("controls cabinet");
  });

  test("nothing observed is unknown", () => {
    expect(run({})("completeness").reason).toBe("components_not_observed");
  });
});

describe("identity gate", () => {
  test("no tag makes every other check unknown", () => {
    const check = run({ tag: null, location: "PAD-A" });
    expect(check("identity").result).toBe("unknown");
    for (const name of ["spec", "substitution", "location", "revision", "completeness"] as const) {
      expect(check(name)).toMatchObject({ result: "unknown", reason: "no_identity" });
    }
  });

  test("a tag not in the project fails identity", () => {
    expect(run({ tag: "GEN-9" })("identity")).toMatchObject({
      result: "fail",
      reason: "not_in_project",
    });
  });
});
