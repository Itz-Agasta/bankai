import { beforeAll, describe, expect, test } from "bun:test";
import {
  linkObservations,
  normalizeLocation,
  normalizeModel,
  normalizeTag,
  ocrDistance,
} from "../src/link";
import type { Project } from "../src/project/types";
import { loadMini, obs } from "./helpers";

let mini: Project;
beforeAll(async () => {
  mini = await loadMini();
});

describe("normalize", () => {
  test("tags", () => {
    expect(normalizeTag("Generator 3")).toBe("GEN-3");
    expect(normalizeTag("g-3")).toBe("GEN-3");
    expect(normalizeTag("gen 3")).toBe("GEN-3");
    expect(normalizeTag(" xfmr1 ")).toBe("TX-1");
  });

  test("locations", () => {
    expect(normalizeLocation("pad b ")).toBe("PAD-B");
    expect(normalizeLocation("Hall  1")).toBe("HALL-1");
  });

  test("models", () => {
    expect(normalizeModel("C2000 D6")).toBe("C2000D6");
    expect(normalizeModel("cr 45-2/a.b")).toBe("CR452AB");
  });
});

describe("ocrDistance", () => {
  test("OCR confusions are cheap", () => {
    expect(ocrDistance("C2OOOD6", "C2000D6")).toBeCloseTo(0.6, 9);
  });

  test("other substitutions cost 1", () => {
    expect(ocrDistance("C2000D6", "C2500D6")).toBe(1);
  });

  test("equal models cost 0", () => {
    expect(ocrDistance("C2000D6", "C2000D6")).toBe(0);
  });
});

describe("linkObservations", () => {
  test("two identical generators with no tag are ambiguous", () => {
    const r = linkObservations(
      obs({ manufacturer: "CUMMINS", model: "C2000 D6", voltage: "415V" }),
      mini,
    );
    const [a, b] = r.candidates;
    expect([a?.tag, b?.tag].sort()).toEqual(["GEN-3", "GEN-4"]);
    expect(a?.score).toBe(b?.score as number);
    expect(r.ambiguous).toBe(true);
    expect(r.links).toEqual([]);
  });

  test("a visible tag links exactly", () => {
    const r = linkObservations(
      obs({ manufacturer: "CUMMINS", model: "C2000 D6", voltage: "415V", tag: "GEN 3" }),
      mini,
    );
    expect(r.candidates[0]).toMatchObject({ tag: "GEN-3", score: 1, method: "exact" });
    expect(r.ambiguous).toBe(false);
    expect(r.links[0]?.record).toEqual({
      kind: "equipment_schedule_row",
      ref: "equipment_schedule.csv#GEN-3",
    });
    expect(r.links[0]?.observation_ids).toContain("o3");
  });

  test("a unit from another vendor links to nothing", () => {
    const r = linkObservations(obs({ manufacturer: "Caterpillar", model: "3516C" }), mini);
    expect(r.candidates.every((c) => c.score <= 0.3)).toBe(true);
    expect(r.links).toEqual([]);
  });

  test("a tag only on a PO links to the PO line", () => {
    const r = linkObservations(obs({ tag: "pump 9" }), mini);
    expect(r.links[0]?.record).toEqual({ kind: "po_line", ref: "PO-1070#L2" });
  });

  test("an OCR-confused model still links fuzzily when unique", () => {
    const r = linkObservations(
      obs({ manufacturer: "Vertiv", model: "PXO8O", voltage: "415" }),
      mini,
    );
    expect(r.candidates[0]).toMatchObject({ tag: "CRAH-2", method: "fuzzy" });
    expect(r.links).toHaveLength(1);
  });
});
