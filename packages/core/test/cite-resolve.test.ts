import { describe, expect, test } from "bun:test";
import type { Citation } from "@bankai/schemas";
import { resolveCitation } from "../src/cite-resolve";
import { loadMini } from "./helpers";

const project = await loadMini();
const r = (kind: Citation["kind"], ref: string) => resolveCitation(project, { kind, ref });

describe("resolveCitation", () => {
  test("an equipment row is the current row for the tag", () => {
    expect(r("equipment_schedule_row", "equipment_schedule.csv#GEN-3")).toMatchObject({
      tag: "GEN-3",
      location: "PAD-B",
    });
  });

  test("a PO line", () => {
    expect(r("po_line", "PO-1042#L14")).toMatchObject({ po: "PO-1042", line: 14 });
  });

  test("a drawing revision", () => {
    expect(r("drawing", "E-201@revC")).toMatchObject({ drawing: "E-201", revision: "C" });
    expect(r("drawing", "E-201@revB")).toMatchObject({ revision: "B", superseded_by: "C" });
  });

  test("a schedule activity", () => {
    expect(r("schedule_activity", "A30")).toMatchObject({ id: "A30" });
  });

  test("a delivery line", () => {
    expect(r("delivery_line", "DT-88#L1")).toMatchObject({ ticket: "DT-88", line: 1 });
  });

  test("a submittal is every row it covers", () => {
    expect(r("submittal", "SUB-07")).toEqual([
      expect.objectContaining({ id: "SUB-07", tag: "GEN-3" }),
      expect.objectContaining({ id: "SUB-07", tag: "GEN-4" }),
    ]);
  });

  test("a new decision or action is null", () => {
    expect(r("decision", "decisions.json#new-abc")).toBeNull();
    expect(r("action_item", "actions.json#new-abc")).toBeNull();
  });

  test("photo and audio refs give the file and region", () => {
    expect(r("photo_region", "IMG.jpg#bbox(1,2,3,4)")).toEqual({
      file: "IMG.jpg",
      region: "bbox(1,2,3,4)",
    });
    expect(r("audio_span", "n.wav@1.0-2.0")).toEqual({ file: "n.wav", region: "1.0-2.0" });
  });

  test("an unknown ref is NOT_FOUND", () => {
    for (const [kind, ref] of [
      ["po_line", "PO-9999#L1"],
      ["po_line", "garbage"],
      ["equipment_schedule_row", "equipment_schedule.csv#NOPE-1"],
      ["drawing", "E-999@revA"],
      ["schedule_activity", "A999"],
      ["delivery_line", "DT-88#L9"],
      ["submittal", "SUB-99"],
      ["decision", "decisions.json#D-404"],
      ["photo_region", "nohash.jpg"],
    ] as const)
      expect(() => r(kind, ref)).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });
});
