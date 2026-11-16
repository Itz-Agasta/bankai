import { beforeAll, describe, expect, test } from "bun:test";
import type { Verdict } from "@bankai/schemas";
import { join } from "node:path";
import { fakeVision, memoryTracer } from "../src/models";
import type { Project } from "../src/project/types";
import { proposeForVerify, verifyEquipment } from "../src/verify";
import { loadMini } from "./helpers";

const PLATE = join(import.meta.dir, "fixtures/plate.jpg");
const GEN = {
  manufacturer: "Cummins",
  model: "C2000D6",
  voltage: "415",
  kva: "2000",
  phase: "3",
  frequency: "50",
};

let mini: Project;
beforeAll(async () => {
  mini = await loadMini();
});

function verify(location: string): Promise<Verdict> {
  const entry = {
    "*": { plate: { x: 200, y: 150, w: 400, h: 260 }, tags: ["GEN-3"], fields: GEN },
  };
  return verifyEquipment(
    { photos: [PLATE], location },
    {
      project: mini,
      models: { primary: fakeVision("p", entry), checker: fakeVision("c", entry) },
      tracer: memoryTracer("t"),
    },
  );
}

describe("proposeForVerify", () => {
  test("a confirmed unit at a given location proposes its install status", async () => {
    const v = await verify("PAD-B");
    expect(v.status).toBe("confirmed");
    const us = proposeForVerify(v, "PAD-B", mini);
    expect(us).toHaveLength(1);
    expect(us[0]).toMatchObject({
      id: `upd_${v.id}_1`,
      field: "install_status",
      old: "",
      new: "installed at PAD-B",
      target: { kind: "equipment_schedule_row", ref: "equipment_schedule.csv#GEN-3" },
      confidence: v.confidence,
      approval: "pending",
      approved_by: null,
      at: null,
    });
    expect(us[0]!.evidence.map((c) => c.kind)).toContain("drawing");
  });

  test("a flagged unit proposes nothing", async () => {
    const v = await verify("PAD-A");
    expect(v.status).toBe("flagged");
    expect(proposeForVerify(v, "PAD-A", mini)).toEqual([]);
  });

  test("a confirmed unit at a location the project does not know proposes nothing", async () => {
    const v = await verify("PAD-Z");
    expect(v.status).toBe("confirmed");
    expect(proposeForVerify(v, "PAD-Z", mini)).toEqual([]);
  });

  test("a confirmed tag missing from the equipment schedule proposes nothing", async () => {
    const v = await verify("PAD-B");
    expect(proposeForVerify({ ...v, subject_tag: "PUMP-9" }, "PAD-B", mini)).toEqual([]);
  });

  test("no location, no proposal", async () => {
    const v = await verify("PAD-B");
    expect(proposeForVerify(v, null, mini)).toEqual([]);
  });
});
