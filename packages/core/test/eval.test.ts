import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeModelsFor, renderReport, runEval } from "../src/eval";

const ROOT = join(import.meta.dir, "../../..");
const SET = join(ROOT, "eval/fixtures");
const PROJECTS = join(ROOT, "data/fixtures");

const evaluate = async (set = SET) =>
  runEval({ set, projectRoot: PROJECTS, models: await fakeModelsFor(set) });

describe("runEval on the fixture set", () => {
  test("scores every case right and fabricates nothing", async () => {
    const r = await evaluate();
    expect(r.cases).toHaveLength(3);
    expect(r.verdictAccuracy).toBe(1);
    expect(r.fabricated).toBe(0);
    expect(r.fieldAccuracy).toBe(1);
  });

  test("not_in_project goes to a human, so coverage is 2 of 3 and every answer given is right", async () => {
    const r = await evaluate();
    expect(r.coverage).toBeCloseTo(2 / 3, 9);
    expect(r.selectiveAccuracy).toBe(1);
  });

  test("a wrong expectation lowers verdict accuracy to 2 of 3", async () => {
    const set = await mkdtemp(join(tmpdir(), "bankai-eval-"));
    await cp(SET, set, { recursive: true });
    const file = join(set, "scenarios/s002-gen3-wrong-pad.json");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace('"status": "flagged"', '"status": "confirmed"'),
    );
    expect((await evaluate(set)).verdictAccuracy).toBeCloseTo(2 / 3, 9);
  });

  test("the report shows the headline metrics and per-kind accuracy", async () => {
    const md = renderReport(await evaluate());
    expect(md).toContain("Verdict accuracy");
    expect(md).toContain("Fabricated");
    expect(md).toContain("not_in_project");
  });
});
