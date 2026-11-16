import { describe, expect, test } from "bun:test";
import { PhotoLabel, Scenario } from "@bankai/schemas";
import { join } from "node:path";
import { hasExif, hasMetadata, stripMetadata } from "../src/perceive/exif";

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

  test("a scenario with an empty location string is rejected", async () => {
    const scenario = await readJson("eval/scenarios/_template.json");
    expect(Scenario.safeParse({ ...scenario, location: "" }).success).toBe(false);
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

  test("skips 0xFF fill bytes before a marker", () => {
    const exif = [0xff, 0xff, 0xff, 0xe1, 0, 8, 0x45, 0x78, 0x69, 0x66, 0, 0];
    expect(hasExif(new Uint8Array([0xff, 0xd8, ...exif, 0xff, 0xd9]))).toBe(true);
  });

  test("hasMetadata catches XMP in a JPEG", () => {
    const ns = [..."http://ns.adobe.com/xap/1.0/\0"].map((c) => c.charCodeAt(0));
    const app1 = [0xff, 0xe1, 0, ns.length + 2, ...ns];
    const bytes = new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xd9]);
    expect(hasExif(bytes)).toBe(false);
    expect(hasMetadata(bytes)).toBe(true);
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
