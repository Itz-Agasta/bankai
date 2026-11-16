import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Verdict } from "@bankai/schemas";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const MAIN = join(ROOT, "apps/cli/src/main.ts");
const PLATE = join(ROOT, "packages/core/test/fixtures/plate.jpg");

// A temp copy: verify now writes .bankai/state.db next to the project files.
let project = "";
beforeAll(async () => {
  project = join(await mkdtemp(join(tmpdir(), "bankai-cli-proj-")), "mini");
  await cp(join(ROOT, "data/fixtures/mini"), project, { recursive: true });
});
afterAll(() => rm(join(project, ".."), { recursive: true, force: true }));

async function fakeScript() {
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
  const path = join(await mkdtemp(join(tmpdir(), "bankai-cli-")), "fake.json");
  await writeFile(path, JSON.stringify({ primary: entry, checker: entry }));
  return path;
}

async function bankai(args: string[]) {
  const proc = Bun.spawn(["bun", MAIN, ...args], {
    cwd: ROOT,
    env: { ...process.env, BANKAI_FAKE_MODELS: await fakeScript(), NO_COLOR: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { out, err, code };
}

describe("bankai verify", () => {
  test("--json prints a flagged Verdict for GEN-3 on PAD-A", async () => {
    const r = await bankai([
      "verify",
      PLATE,
      "--project",
      project,
      "--location",
      "PAD-A",
      "--json",
    ]);
    expect(r.code).toBe(0);
    const v = Verdict.parse(JSON.parse(r.out));
    expect(v.status).toBe("flagged");
  });

  test("human output names the status and each check", async () => {
    const r = await bankai(["verify", PLATE, "--project", project, "--location", "PAD-A"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("FLAGGED");
    expect(r.out).toContain("belongs at PAD-B (E-201 rev C)");
  });

  test("an empty photo exits 2 with a structured error", async () => {
    const empty = join(await mkdtemp(join(tmpdir(), "bankai-cli-")), "empty.jpg");
    await writeFile(empty, "");
    const r = await bankai(["verify", empty, "--project", project, "--json"]);
    expect(r.code).toBe(2);
    expect(JSON.parse(r.out).error.code).toBe("INPUT_UNSUPPORTED");
  });
});
