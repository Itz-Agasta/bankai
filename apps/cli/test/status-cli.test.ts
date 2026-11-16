import { afterAll, expect, test } from "bun:test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const MAIN = join(ROOT, "apps/cli/src/main.ts");
const PLATE = join(ROOT, "packages/core/test/fixtures/plate.jpg");
const temps: string[] = [];
afterAll(() => Promise.all(temps.map((d) => rm(d, { recursive: true, force: true }))));

async function bankai(args: string[], fake: string) {
  const proc = Bun.spawn(["bun", MAIN, ...args], {
    cwd: ROOT,
    env: { ...process.env, BANKAI_FAKE_MODELS: fake, NO_COLOR: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { out, code };
}

test("a flagged verify shows up in status from a separate process", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bankai-status-"));
  temps.push(dir);
  const project = join(dir, "mini");
  await cp(join(ROOT, "data/fixtures/mini"), project, { recursive: true });
  const entry = {
    "*": {
      plate: { x: 200, y: 150, w: 400, h: 260 },
      tags: ["GEN-3"],
      fields: {
        manufacturer: "Cummins",
        model: "C2000D6",
        voltage: "415",
        kva: "2000",
        phase: "3",
        frequency: "50",
      },
    },
  };
  const fake = join(dir, "fake.json");
  await writeFile(fake, JSON.stringify({ primary: entry, checker: entry }));

  expect(
    (await bankai(["verify", PLATE, "--project", project, "--location", "PAD-A"], fake)).code,
  ).toBe(0);
  const status = await bankai(["status", "--project", project, "--json"], fake);
  expect(status.code).toBe(0);
  const items = JSON.parse(status.out);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ subject_tag: "GEN-3", status: "flagged" });

  const human = await bankai(["status", "--project", project], fake);
  expect(human.out).toContain("GEN-3  flagged  since");
});

test("status on a folder that is not a project exits 2", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bankai-status-"));
  temps.push(dir);
  const r = await bankai(["status", "--project", join(dir, "typo"), "--json"], "");
  expect(r.code).toBe(2);
  expect(JSON.parse(r.out).error.code).toBe("PROJECT_INVALID");
});
