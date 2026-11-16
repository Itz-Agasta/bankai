import { beforeAll, describe, expect, test } from "bun:test";
import type { Field, Observation } from "@bankai/schemas";
import { join } from "node:path";
import { rankCandidates } from "../src/link";
import { resolveTie, tieQuestions } from "../src/link/tiebreak";
import { fakeVision, memoryTracer } from "../src/models";
import type { VisionModel } from "../src/models/types";
import { indexProject } from "../src/project/index-project";
import type { Project } from "../src/project/types";
import { verifyEquipment } from "../src/verify";
import { loadMini, obs } from "./helpers";

const PLATE = join(import.meta.dir, "fixtures/plate.jpg");
const BOX = { x: 200, y: 150, w: 400, h: 260 };
let mini: Project;
/** Mini plus GEN-5: same maker and model as GEN-3, but 2500 kVA. */
let sizes: Project;

beforeAll(async () => {
  mini = await loadMini();
  const row = mini.byTag.get("GEN-3")!;
  const po = mini.poByTag.get("GEN-3")!;
  sizes = indexProject("sizes", {
    ...mini,
    equipment: [
      ...mini.equipment.filter((r) => r.tag !== "GEN-4"),
      { ...row, tag: "GEN-5", kva: 2500, location: "PAD-C" },
    ],
    poLines: [
      ...mini.poLines.filter((l) => l.tag !== "GEN-4"),
      { ...po, tag: "GEN-5", line: 16, kva: 2500 },
    ],
  });
});

const near = (o: Observation[], p: Project) => {
  const c = rankCandidates(o, p);
  return c.filter((x) => x.score >= c[0]!.score - 0.15);
};

describe("tieQuestions", () => {
  test("identical twins have nothing to ask", () => {
    const o = obs({ manufacturer: "Cummins", model: "C2000D6" });
    expect(tieQuestions(near(o, mini), mini)).toEqual([]);
  });

  test("units that differ in kva ask for kva with both values", () => {
    const o = obs({ manufacturer: "Cummins", model: "C2000D6" });
    expect(tieQuestions(near(o, sizes), sizes)).toEqual([
      { field: "kva", options: ["2000", "2500"] },
    ]);
  });
});

describe("resolveTie", () => {
  test("an agreed value that fits one candidate picks it", () => {
    const o = obs({ manufacturer: "Cummins", model: "C2000D6" });
    expect(resolveTie(near(o, sizes), { kva: "2500" }, sizes)).toBe("GEN-5");
  });

  test("voltage compares every number, not just the first", () => {
    const o = obs({ manufacturer: "Cummins", model: "C2000D6" });
    const row = sizes.byTag.get("GEN-3")!;
    const volts = indexProject("volts", {
      ...sizes,
      equipment: sizes.equipment.map((r) =>
        r.tag === "GEN-5"
          ? { ...r, kva: row.kva, voltage: "415/230" }
          : r.tag === "GEN-3"
            ? { ...r, voltage: "415/240" }
            : r,
      ),
      poLines: sizes.poLines.map((l) =>
        l.tag === "GEN-5"
          ? { ...l, kva: 2000, voltage: "415/230" }
          : l.tag === "GEN-3"
            ? { ...l, voltage: "415/240" }
            : l,
      ),
    });
    expect(resolveTie(near(o, volts), { voltage: "415/240" }, volts)).toBe("GEN-3");
  });

  test("no agreed value, or one that fits nobody, picks nothing", () => {
    const o = obs({ manufacturer: "Cummins", model: "C2000D6" });
    expect(resolveTie(near(o, sizes), {}, sizes)).toBeNull();
    expect(resolveTie(near(o, sizes), { kva: "1800" }, sizes)).toBeNull();
  });
});

describe("verify with a tie-break", () => {
  const fields = {
    manufacturer: "Cummins",
    model: "C2000D6",
    voltage: "415",
    phase: "3",
    frequency: "50",
  };
  const pair = (p: Partial<Record<Field, string>>, c: Partial<Record<Field, string>>) => ({
    primary: fakeVision("fake-p", { "*": { plate: BOX, tags: [], fields, choose: p } }),
    checker: fakeVision("fake-c", { "*": { plate: BOX, tags: [], fields, choose: c } }),
  });
  const run = (project: Project, models: { primary: VisionModel; checker: VisionModel }) => {
    const tracer = memoryTracer("t");
    return verifyEquipment(
      { photos: [PLATE], location: "PAD-C" },
      { project, models, tracer },
    ).then((v) => ({ v, trace: tracer.events() }));
  };

  test("both models reading 2500 kVA link GEN-5 by tie-break", async () => {
    const { v, trace } = await run(sizes, pair({ kva: "2500" }, { kva: "2500" }));
    expect(v.subject_tag).toBe("GEN-5");
    expect(v.candidates).toEqual([]);
    expect(trace.find((e) => e.step === "link")?.summary).toContain("llm_tiebreak");
  });

  test("models that disagree leave it to a human", async () => {
    const { v } = await run(sizes, pair({ kva: "2500" }, { kva: "2000" }));
    expect(v.subject_tag).toBeNull();
    expect(v.status).toBe("needs_human");
    expect(v.candidates.sort()).toEqual(["GEN-3", "GEN-5"]);
  });

  test("a value outside the options is ignored", async () => {
    const { v } = await run(sizes, pair({ kva: "2500 kVA" }, { kva: "2500 kVA" }));
    expect(v.subject_tag).toBeNull();
  });

  test("a visible tag that matches no record is never overridden", async () => {
    const tagged = {
      primary: fakeVision("fake-p", {
        "*": { plate: BOX, tags: ["GEN-9"], fields, choose: { kva: "2500" } },
      }),
      checker: fakeVision("fake-c", {
        "*": { plate: BOX, tags: [], fields, choose: { kva: "2500" } },
      }),
    };
    const { v } = await run(sizes, tagged);
    expect(v.subject_tag).toBeNull();
  });

  test("two plates read: no tie-break, the answer could come from the wrong plate", async () => {
    const tracer = memoryTracer("t");
    const v = await verifyEquipment(
      { photos: [PLATE, PLATE], location: "PAD-C" },
      { project: sizes, models: pair({ kva: "2500" }, { kva: "2500" }), tracer },
    );
    expect(v.subject_tag).toBeNull();
  });

  test("a failing choose call leaves the tie open and still meters the other call", async () => {
    const p = pair({ kva: "2500" }, {});
    const broken: VisionModel = { ...p.checker, choose: () => Promise.reject(new Error("503")) };
    const { v, trace } = await run(sizes, { primary: p.primary, checker: broken });
    expect(v.subject_tag).toBeNull();
    expect(trace.some((e) => e.step === "tiebreak.primary")).toBe(true);
  });

  test("a choose call that throws synchronously still leaves the tie open", async () => {
    const p = pair({ kva: "2500" }, { kva: "2500" });
    const broken: VisionModel = {
      ...p.checker,
      choose: () => {
        throw new Error("boom");
      },
    };
    const { v } = await run(sizes, { primary: p.primary, checker: broken });
    expect(v.subject_tag).toBeNull();
  });

  test("identical twins never call the tie-break", async () => {
    let asked = false;
    const spy = (m: VisionModel): VisionModel => ({
      ...m,
      choose: async (...a) => ((asked = true), m.choose!(...a)),
    });
    const p = pair({}, {});
    const { v } = await run(mini, { primary: spy(p.primary), checker: spy(p.checker) });
    expect(asked).toBe(false);
    expect(v.retake_request?.region).toBe("equipment tag");
  });
});
