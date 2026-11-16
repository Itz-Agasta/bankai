import { beforeAll, describe, expect, test } from "bun:test";
import type { Check, Field, Verdict } from "@bankai/schemas";
import { join } from "node:path";
import { fakeVision, memoryTracer } from "../src/models";
import type { BBox } from "../src/models/types";
import type { Project } from "../src/project/types";
import { confidence, decideStatus, dropUncited, verifyEquipment } from "../src/verify";
import { loadMini } from "./helpers";

const PLATE = join(import.meta.dir, "fixtures/plate.jpg");
const BLANK = join(import.meta.dir, "fixtures/blank.jpg");
const BOX: BBox = { x: 200, y: 150, w: 400, h: 260 };
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

function models(fields: Partial<Record<Field, string>>, tags: string[], plate: BBox | null = BOX) {
  const entry = { "*": { plate, tags, fields } };
  return { primary: fakeVision("fake-p", entry), checker: fakeVision("fake-c", entry) };
}

const verify = (opts: {
  photo?: string;
  location: string | null;
  tags?: string[];
  fields?: Partial<Record<Field, string>>;
  plate?: BBox | null;
}) =>
  verifyEquipment(
    { photos: [opts.photo ?? PLATE], location: opts.location },
    {
      project: mini,
      models: models(opts.fields ?? GEN, opts.tags ?? ["GEN-3"], opts.plate),
      tracer: memoryTracer("t"),
    },
  );

const failing = (v: Verdict) =>
  v.checks
    .filter((c) => c.result === "fail")
    .map((c) => c.name)
    .sort();

describe("verifyEquipment", () => {
  test("GEN-3 on the superseded pad is flagged with location and revision", async () => {
    const v = await verify({ location: "PAD-A" });
    expect(v.status).toBe("flagged");
    expect(v.subject_tag).toBe("GEN-3");
    expect(failing(v)).toEqual(["location", "revision"]);
    for (const c of v.checks.filter((c) => c.result !== "unknown"))
      expect(c.citations.length).toBeGreaterThan(0);
  });

  test("GEN-3 on its designed pad is confirmed", async () => {
    expect((await verify({ location: "PAD-B" })).status).toBe("confirmed");
  });

  test("two identical units with no tag need a human and list both", async () => {
    const v = await verify({ location: "PAD-B", tags: [] });
    expect(v.status).toBe("needs_human");
    expect(v.candidates).toEqual(["GEN-3", "GEN-4"]);
    expect(v.subject_tag).toBeNull();
  });

  test("a blank photo needs a human: no nameplate found", async () => {
    const v = await verify({ photo: BLANK, location: "PAD-B", tags: [], plate: null });
    expect(v.status).toBe("needs_human");
    expect(v.checks.find((c) => c.name === "identity")).toMatchObject({
      result: "unknown",
      reason: "no_nameplate_found",
    });
  });

  test("reading fewer ratings lowers confidence", async () => {
    const full = await verify({ location: "PAD-B" });
    const partial = await verify({
      location: "PAD-B",
      fields: { manufacturer: "Cummins", model: "C2000D6" },
    });
    expect(partial.confidence).toBeLessThan(full.confidence);
  });

  test("records link, rules and decide after perception", async () => {
    const tracer = memoryTracer("t");
    await verifyEquipment(
      { photos: [PLATE], location: "PAD-B" },
      { project: mini, models: models(GEN, ["GEN-3"]), tracer },
    );
    expect(
      tracer
        .events()
        .map((e) => e.step)
        .slice(-3),
    ).toEqual(["link", "rules", "decide"]);
  });
});

describe("decideStatus and confidence", () => {
  const check = (name: Check["name"], result: Check["result"]): Check => ({
    name,
    result,
    reason: "r",
    citations: [],
    range: null,
  });

  test("identity not passing needs a human", () => {
    expect(decideStatus([check("identity", "unknown")], 0.99, 0.7)).toBe("needs_human");
  });

  test("a confident fail is flagged; an unsure one needs a human", () => {
    const checks = [check("identity", "pass"), check("location", "fail")];
    expect(decideStatus(checks, 0.8, 0.7)).toBe("flagged");
    expect(decideStatus(checks, 0.5, 0.7)).toBe("needs_human");
  });

  test("confidence averages its signals", () => {
    expect(confidence({ agreementRate: 1, linkScore: 1, margin: 0.3, ratingCoverage: 1 })).toBe(1);
    expect(confidence({ agreementRate: 1, linkScore: 1, margin: 0.15, ratingCoverage: 0.5 })).toBe(
      0.75,
    );
  });
});

describe("citations", () => {
  test("a check cites each source once", async () => {
    const v = await verify({ location: "PAD-B" });
    for (const c of v.checks) {
      const keys = c.citations.map((x) => `${x.kind}|${x.ref}|${x.quote ?? ""}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("dropUncited", () => {
  test("a fail with no citations becomes unknown", () => {
    const v: Verdict = {
      id: "v",
      subject_tag: "GEN-3",
      status: "flagged",
      checks: [{ name: "spec", result: "fail", reason: "x", citations: [], range: null }],
      confidence: 0.9,
      retake_request: null,
      candidates: [],
      models: [],
      cost_usd: 0,
      latency_ms: 0,
    };
    expect(dropUncited(v).checks[0]).toMatchObject({ result: "unknown", reason: "uncited" });
  });
});
