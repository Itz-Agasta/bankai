import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProject } from "../src/project/load";

const MINI = join(import.meta.dir, "../../../data/fixtures/mini");

async function brokenCopy(file: string, edit: (text: string) => string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bankai-mini-"));
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

  test("an activity whose low duration exceeds likely is rejected", async () => {
    const dir = await brokenCopy("schedule.json", (t) =>
      t.replace('"duration_low_days": 1', '"duration_low_days": 9'),
    );
    const err = await loadError(dir);
    expect(err.code).toBe("PROJECT_INVALID");
    expect(err.detail).toContain("schedule.json:1:");
  });
});
