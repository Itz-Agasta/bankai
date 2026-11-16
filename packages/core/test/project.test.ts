import { afterAll, describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProject } from "../src/project/load";

const MINI = join(import.meta.dir, "../../../data/fixtures/mini");

const temps: string[] = [];
afterAll(() => Promise.all(temps.map((d) => rm(d, { recursive: true, force: true }))));

async function brokenCopy(file: string, edit: (text: string) => string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bankai-mini-"));
  temps.push(dir);
  await cp(MINI, dir, { recursive: true });
  const path = join(dir, file);
  await writeFile(path, edit(await readFile(path, "utf8")));
  return dir;
}

async function loadError(dir: string): Promise<{ code?: string; detail?: string }> {
  try {
    await loadProject(dir);
  } catch (e) {
    return e as { code?: string; detail?: string };
  }
  throw new Error("expected loadProject to throw");
}

describe("loadProject on the mini fixture", () => {
  test("indexes 4 current equipment rows by tag", async () => {
    const p = await loadProject(MINI);
    expect(p.byTag.size).toBe(4);
    expect([...p.byTag.keys()].sort()).toEqual(["CRAH-2", "GEN-3", "GEN-4", "TX-1"]);
  });

  test("GEN-3 sits at PAD-B on the current revision", async () => {
    const p = await loadProject(MINI);
    expect(p.byTag.get("GEN-3")?.location).toBe("PAD-B");
  });

  test("keeps the superseded rev B row for GEN-3 at PAD-A", async () => {
    const p = await loadProject(MINI);
    const old = p.equipment.find((r) => r.tag === "GEN-3" && r.revision === "B");
    expect(old?.location).toBe("PAD-A");
  });

  test("current revision of E-201 is C", async () => {
    const p = await loadProject(MINI);
    expect(p.currentRevision("E-201")?.revision).toBe("C");
  });

  test("PUMP-9 is on a PO but not in the equipment schedule", async () => {
    const p = await loadProject(MINI);
    expect(p.poByTag.get("PUMP-9")?.po).toBe("PO-1070");
    expect(p.byTag.has("PUMP-9")).toBe(false);
  });
});

describe("loadProject rejects bad data", () => {
  test("a non-numeric kva names the file and line", async () => {
    const dir = await brokenCopy("equipment_schedule.csv", (t) => {
      const lines = t.split("\n");
      lines[1] = lines[1]!.replace(",2000,", ",lots,");
      return lines.join("\n");
    });
    const err = await loadError(dir);
    expect(err.code).toBe("PROJECT_INVALID");
    expect(err.detail?.startsWith("equipment_schedule.csv:2:")).toBe(true);
  });

  test("an equipment row on a drawing revision missing from the register is rejected", async () => {
    const dir = await brokenCopy("equipment_schedule.csv", (t) => t.replace("M-301,B", "M-301,Z"));
    const err = await loadError(dir);
    expect(err.code).toBe("PROJECT_INVALID");
    expect(err.detail).toStartWith("equipment_schedule.csv:5:");
  });

  test("a drawing with superseded_on but no superseded_by is rejected", async () => {
    const dir = await brokenCopy("drawings.csv", (t) =>
      t.replace("E-201,B,2026-08-10,C,", "E-201,B,2026-08-10,,"),
    );
    const err = await loadError(dir);
    expect(err.code).toBe("PROJECT_INVALID");
    expect(err.detail).toStartWith("drawings.csv:2:");
  });

  test("a drawing with two current revisions is rejected", async () => {
    const dir = await brokenCopy("drawings.csv", (t) =>
      t.replace("E-201,B,2026-08-10,C,2026-10-02", "E-201,B,2026-08-10,,"),
    );
    const err = await loadError(dir);
    expect(err.code).toBe("PROJECT_INVALID");
    expect(err.detail).toContain("E-201");
  });

  test("a malformed CSV quote is reported as invalid project data", async () => {
    const dir = await brokenCopy("drawings.csv", (t) => t.replace("M-301,B", 'M-301,"B'));
    const err = await loadError(dir);
    expect(err.code).toBe("PROJECT_INVALID");
    expect(err.detail).toBe("drawings.csv:5: unterminated quote");
  });

  test("two current rows for one tag are rejected", async () => {
    const dir = await brokenCopy("equipment_schedule.csv", (t) =>
      t.replace("GEN-4,generator,PAD-C", "GEN-3,generator,PAD-C"),
    );
    const err = await loadError(dir);
    expect(err.code).toBe("PROJECT_INVALID");
    expect(err.detail).toBe("equipment_schedule.csv:3: GEN-3: duplicate current row");
  });

  test("superseded_by must name a revision of the same drawing", async () => {
    const dir = await brokenCopy("drawings.csv", (t) =>
      t.replace("E-201,B,2026-08-10,C,", "E-201,B,2026-08-10,D,"),
    );
    const err = await loadError(dir);
    expect(err.code).toBe("PROJECT_INVALID");
    expect(err.detail).toStartWith("drawings.csv:2:");
  });

  test("a negative delivery quantity is rejected", async () => {
    const dir = await brokenCopy("deliveries.json", (t) => t.replace('"qty": 1', '"qty": -1'));
    const err = await loadError(dir);
    expect(err.detail).toStartWith("deliveries.json:1: qty:");
  });

  test("an activity whose low duration exceeds likely is rejected", async () => {
    const dir = await brokenCopy("schedule.json", (t) =>
      t.replace('"duration_low_days": 1', '"duration_low_days": 9'),
    );
    const err = await loadError(dir);
    expect(err.code).toBe("PROJECT_INVALID");
    expect(err.detail).toContain("schedule.json:1:");
  });
});
