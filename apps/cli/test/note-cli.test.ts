import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { NoteRun } from "@bankai/schemas";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractScript, N001, transcript } from "../../../packages/core/test/fixtures/notes";

const ROOT = join(import.meta.dir, "../../..");
const MAIN = join(ROOT, "apps/cli/src/main.ts");
const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 7, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 7]);

let project = "";
let fake = "";
let audio = "";
beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "bankai-cli-note-"));
  project = join(dir, "mini");
  await cp(join(ROOT, "data/fixtures/mini"), project, { recursive: true });
  audio = join(project, "n001.wav");
  await writeFile(audio, WAV);
  const plate = { "*": { plate: null, tags: [], fields: {} } };
  fake = join(dir, "fake.json");
  await writeFile(
    fake,
    JSON.stringify({
      primary: plate,
      checker: plate,
      speech: { "*": transcript(N001) },
      extract: extractScript(),
    }),
  );
});
afterAll(() => rm(join(project, ".."), { recursive: true, force: true }));

async function bankai(args: string[]) {
  const proc = Bun.spawn(["bun", MAIN, ...args], {
    cwd: ROOT,
    env: { ...process.env, BANKAI_FAKE_MODELS: fake, NO_COLOR: "1" },
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

describe("bankai note", () => {
  test("--json prints a NoteRun", async () => {
    const r = await bankai(["note", audio, "--project", project, "--json"]);
    expect(r.code).toBe(0);
    const run = NoteRun.parse(JSON.parse(r.out));
    expect(run.result.status).toBe("confirmed");
  });

  test("human output shows each claim with its time span and the pending update", async () => {
    const r = await bankai(["note", audio, "--project", project]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("CONFIRMED");
    expect(r.out).toContain("[2.0-4.8] status");
    expect(r.out).toContain("install_status on equipment_schedule.csv#GEN-3: '' -> 'set at PAD-B'");
  });

  test("bankai status lists the pending note proposal", async () => {
    const fresh = join(project, "..", "fresh");
    await cp(join(ROOT, "data/fixtures/mini"), fresh, { recursive: true });
    await writeFile(join(fresh, "n001.wav"), WAV);
    const n = await bankai(["note", join(fresh, "n001.wav"), "--project", fresh]);
    expect(n.code).toBe(0);
    const r = await bankai(["status", "--project", fresh]);
    expect(r.out).toContain("set at PAD-B");
  });

  test("a missing project is exit 2", async () => {
    const r = await bankai(["note", audio, "--project", join(project, "nope")]);
    expect(r.code).toBe(2);
  });
});
