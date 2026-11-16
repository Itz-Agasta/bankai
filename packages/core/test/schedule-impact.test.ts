import { beforeAll, describe, expect, test } from "bun:test";
import type { Activity } from "@bankai/schemas";
import type { Project } from "../src/project/types";
import { delaysOf, forwardPass, scheduleImpact } from "../src/rules/schedule-impact";
import { loadMini } from "./helpers";

let mini: Project;
beforeAll(async () => {
  mini = await loadMini();
});

const ctx = (tag: string | null) => ({
  project: mini,
  tag,
  observations: [],
  location: null,
  observedComponents: [],
});

describe("impactOf with a recorded delay", () => {
  test("a further delay counts from the already delayed schedule", async () => {
    const { impactOf } = await import("../src/rules/schedule-impact");
    const acts = mini.activities.map((a) => (a.id === "A10" ? { ...a, delay_days: 2 } : a));
    const own = acts.filter((a) => a.id === "A30");
    const c = impactOf(acts, own, { low: 3, likely: 3, high: 3, unit: "days" });
    expect(c.range?.likely).toBe(3);
    expect(c.reason).toContain("Energization slips 3 days");
  });
});

describe("forwardPass", () => {
  test("existing delay_days shift the baseline", () => {
    const acts: Activity[] = [
      {
        id: "A10",
        name: "Set",
        tag: null,
        duration_days: 2,
        duration_low_days: 2,
        duration_high_days: 2,
        predecessors: [],
        milestone: false,
        delay_days: 2,
      },
      {
        id: "A20",
        name: "Energize",
        tag: null,
        duration_days: 3,
        duration_low_days: 3,
        duration_high_days: 3,
        predecessors: ["A10"],
        milestone: true,
      },
    ];
    expect(forwardPass(acts, "likely", delaysOf(acts)).get("A20")?.ef).toBe(7);
  });

  test("energization finishes on day 7 likely, 5 low, 11 high", () => {
    expect(forwardPass(mini.activities).get("A40")?.ef).toBe(7);
    expect(forwardPass(mini.activities, "low").get("A40")?.ef).toBe(5);
    expect(forwardPass(mini.activities, "high").get("A40")?.ef).toBe(11);
  });

  test("a cycle is invalid project data", () => {
    const act = (id: string, pred: string): Activity => ({
      id,
      name: id,
      tag: null,
      duration_days: 1,
      duration_low_days: 1,
      duration_high_days: 1,
      predecessors: [pred],
      milestone: false,
    });
    expect(() => forwardPass([act("X", "Y"), act("Y", "X")])).toThrow(
      expect.objectContaining({ code: "PROJECT_INVALID" }),
    );
  });
});

describe("scheduleImpact", () => {
  test("a GEN-3 delay slips energization by a range", () => {
    const check = scheduleImpact(ctx("GEN-3"), { low: 2, likely: 4, high: 7, unit: "days" });
    expect(check.result).toBe("fail");
    expect(check.reason).toBe("3 activities blocked; Energization slips 4 days (range 0 to 11)");
    expect(check.range).toEqual({ low: 0, likely: 4, high: 11, unit: "days" });
    for (const ref of ["A10", "A20", "A30", "A40"]) {
      expect(check.citations).toContainEqual({ kind: "schedule_activity", ref });
    }
  });

  test("the delay counts once across a unit's chained activities", () => {
    const activities = mini.activities.map((a) => (a.id === "A20" ? { ...a, tag: "GEN-3" } : a));
    const check = scheduleImpact(
      { ...ctx("GEN-3"), project: { ...mini, activities } },
      { low: 2, likely: 4, high: 7, unit: "days" },
    );
    expect(check.range).toEqual({ low: 0, likely: 4, high: 11, unit: "days" });
  });

  test("an invalid network fails even with no delay", () => {
    const activities = mini.activities.map((a) =>
      a.id === "A10" ? { ...a, predecessors: ["A40"] } : a,
    );
    expect(() =>
      scheduleImpact(
        { ...ctx("GEN-3"), project: { ...mini, activities } },
        { low: 0, likely: 0, high: 0, unit: "days" },
      ),
    ).toThrow(expect.objectContaining({ code: "PROJECT_INVALID" }));
  });

  test("duplicate activity ids are invalid", () => {
    expect(() => forwardPass([...mini.activities, mini.activities[0]!])).toThrow(
      expect.objectContaining({ code: "PROJECT_INVALID" }),
    );
  });

  test("a negative or unordered delay is unknown", () => {
    expect(scheduleImpact(ctx("GEN-3"), { low: -1, likely: 2, high: 3, unit: "days" }).reason).toBe(
      "invalid_delay",
    );
    expect(scheduleImpact(ctx("GEN-3"), { low: 5, likely: 2, high: 3, unit: "days" }).reason).toBe(
      "invalid_delay",
    );
  });

  test("no delay passes with no range", () => {
    const check = scheduleImpact(ctx("GEN-3"), { low: 0, likely: 0, high: 0, unit: "days" });
    expect(check).toMatchObject({ result: "pass", range: null });
  });

  test("a tag with no activity is unknown", () => {
    expect(scheduleImpact(ctx("TX-1"), { low: 1, likely: 1, high: 1, unit: "days" }).result).toBe(
      "unknown",
    );
  });
});
