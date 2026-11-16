import { beforeAll, describe, expect, test } from "bun:test";
import type { Activity } from "@bankai/schemas";
import type { Project } from "../src/project/types";
import { forwardPass, scheduleImpact } from "../src/rules/schedule-impact";
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

describe("forwardPass", () => {
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
