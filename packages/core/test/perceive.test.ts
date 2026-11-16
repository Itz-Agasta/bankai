import { describe, expect, test } from "bun:test";
import type { Field } from "@bankai/schemas";
import { mkdtemp, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeVision, memoryMeter, memoryTracer, sha256Hex } from "../src/models";
import { hasExif } from "../src/perceive/exif";
import { loadImage, perceivePhoto, validateField } from "../src/perceive";

const FIX = join(import.meta.dir, "fixtures");
const PLATE = join(FIX, "plate.jpg");
const BLANK = join(FIX, "blank.jpg");
const BOX = { x: 200, y: 150, w: 400, h: 260 };

async function key(path: string) {
  return sha256Hex(await loadImage(path)).slice(0, 12);
}

async function run(
  primary: Partial<Record<Field, string>>,
  checker: Partial<Record<Field, string>>,
  path = PLATE,
) {
  const k = await key(PLATE);
  const models = {
    primary: fakeVision("fake-primary", {
      [k]: { plate: BOX, tags: [], fields: {} },
      "*": { plate: null, tags: [], fields: primary },
    }),
    checker: fakeVision("fake-checker", { "*": { plate: null, tags: [], fields: checker } }),
  };
  const tracer = memoryTracer("run-1");
  const result = await perceivePhoto([path], models, memoryMeter(), tracer);
  return { ...result, tracer };
}

describe("perceivePhoto", () => {
  test("agreement keeps one observation with both votes", async () => {
    const r = await run(
      { manufacturer: "Cummins", model: "C2000D6" },
      { manufacturer: "CUMMINS", model: "C2000 D6" },
    );
    const model = r.observations.filter((o) => o.field === "model");
    expect(model).toHaveLength(1);
    expect(model[0]?.model_votes).toEqual({ primary: "C2000D6", checker: "C2000 D6" });
    expect(model[0]?.evidence).toEqual({
      kind: "photo_region",
      ref: "plate.jpg#bbox(200,150,400,260)",
    });
    expect(r.retake).toBeNull();
  });

  test("disagreement drops the field and asks for a retake", async () => {
    const r = await run({ model: "C2000D6" }, { model: "C2500D6" });
    expect(r.observations.some((o) => o.field === "model")).toBe(false);
    expect(r.retake?.why).toContain("model unreadable");
  });

  test("an implausible voltage is dropped", async () => {
    const r = await run(
      { manufacturer: "Cummins", model: "C2000D6", voltage: "4800V" },
      { voltage: "4800V" },
    );
    expect(r.observations.some((o) => o.field === "voltage")).toBe(false);
  });

  test("one model reading a valid field alone keeps it", async () => {
    const r = await run(
      { manufacturer: "Cummins", model: "C2000D6", frequency: "50" },
      { manufacturer: "Cummins", model: "C2000D6" },
    );
    expect(r.observations.find((o) => o.field === "frequency")?.model_votes).toEqual({
      primary: "50",
      checker: null,
    });
  });

  test("a photo with no nameplate gives no observations", async () => {
    const r = await run({ model: "C2000D6" }, { model: "C2000D6" }, BLANK);
    expect(r.noNameplate).toBe(true);
    expect(r.observations).toEqual([]);
    expect(r.retake).toBeNull();
  });

  test("records trace steps in order", async () => {
    const r = await run({ model: "C2000D6" }, { model: "C2000D6" });
    expect(r.tracer.events().map((e) => e.step)).toEqual([
      "locate",
      "read.primary",
      "read.checker",
      "merge",
    ]);
  });
});

describe("loadImage", () => {
  test("rejects an empty file", async () => {
    const p = join(await mkdtemp(join(tmpdir(), "bankai-img-")), "empty.jpg");
    await writeFile(p, "");
    expect(loadImage(p)).rejects.toMatchObject({ code: "INPUT_UNSUPPORTED" });
  });

  test("rejects a HEIC renamed to .jpg", async () => {
    expect(loadImage(join(FIX, "heic-as.jpg"))).rejects.toMatchObject({
      code: "INPUT_UNSUPPORTED",
    });
  });

  test("rejects a file over 20 MB", async () => {
    const p = join(await mkdtemp(join(tmpdir(), "bankai-img-")), "big.png");
    await writeFile(p, "");
    await truncate(p, 21 * 1024 * 1024);
    expect(loadImage(p)).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
  });

  test("strips EXIF before anything sees the bytes", async () => {
    expect(hasExif(await loadImage(join(FIX, "gps.jpg")))).toBe(false);
  });
});

describe("validateField", () => {
  test("plausible ratings", () => {
    expect(validateField("voltage", "415/240")).toBe(true);
    expect(validateField("voltage", "4800")).toBe(false);
    expect(validateField("frequency", "60 Hz")).toBe(true);
    expect(validateField("phase", "2")).toBe(false);
    expect(validateField("kva", "2000")).toBe(true);
    expect(validateField("kw", "0")).toBe(false);
    expect(validateField("model", "  ")).toBe(false);
  });
});
