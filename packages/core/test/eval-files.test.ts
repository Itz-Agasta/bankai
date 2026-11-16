import { describe, expect, test } from "bun:test";
import { PhotoLabel, Scenario } from "@bankai/schemas";
import { join } from "node:path";
import { hasExif, stripMetadata } from "../src/perceive/exif";

const ROOT = join(import.meta.dir, "../../..");
const readJson = async (p: string) => JSON.parse(await Bun.file(join(ROOT, p)).text());

describe("eval file schemas", () => {
  test("the label template parses", async () => {
    expect(PhotoLabel.safeParse(await readJson("eval/labels/_template.json")).success).toBe(true);
  });

  test("a label not checked for people is rejected", async () => {
    const label = await readJson("eval/labels/_template.json");
    expect(PhotoLabel.safeParse({ ...label, people_checked: false }).success).toBe(false);
  });

  test("the scenario template parses", async () => {
    expect(Scenario.safeParse(await readJson("eval/scenarios/_template.json")).success).toBe(true);
  });

  test("a scenario with an unknown kind is rejected", async () => {
    const scenario = await readJson("eval/scenarios/_template.json");
    expect(Scenario.safeParse({ ...scenario, kind: "vibes" }).success).toBe(false);
  });
});

describe("EXIF", () => {
  test("detects GPS EXIF in a JPEG", async () => {
    const bytes = await Bun.file(join(import.meta.dir, "fixtures/gps.jpg")).bytes();
    expect(hasExif(bytes)).toBe(true);
  });

  test("stripMetadata removes it", async () => {
    const bytes = await Bun.file(join(import.meta.dir, "fixtures/gps.jpg")).bytes();
    expect(hasExif(await stripMetadata(bytes))).toBe(false);
  });

  test("detects an eXIf chunk in a PNG", () => {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const chunk = (type: string, len = 0) => [
      0,
      0,
      0,
      len,
      ...[...type].map((c) => c.charCodeAt(0)),
      ...Array(len + 4).fill(0),
    ];
    expect(
      hasExif(
        new Uint8Array([...sig, ...chunk("IHDR", 13), ...chunk("eXIf", 2), ...chunk("IEND")]),
      ),
    ).toBe(true);
    expect(hasExif(new Uint8Array([...sig, ...chunk("IHDR", 13), ...chunk("IEND")]))).toBe(false);
  });
});
