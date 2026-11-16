import { afterAll, describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeModelsFor, fakeNoteModelsFor, fieldMatches, renderReport, runEval } from "../src/eval";
import { firstNumber } from "../src/readings";

const ROOT = join(import.meta.dir, "../../..");
const SET = join(ROOT, "eval/fixtures");
const PROJECTS = join(ROOT, "data/fixtures");

const temps: string[] = [];
afterAll(() => Promise.all(temps.map((d) => rm(d, { recursive: true, force: true }))));
async function copySet() {
  const set = await mkdtemp(join(tmpdir(), "bankai-eval-"));
  temps.push(set);
  await cp(SET, set, { recursive: true });
  return set;
}

const evaluate = async (set = SET) =>
  runEval({
    set,
    projectRoot: PROJECTS,
    models: await fakeModelsFor(set),
    noteModels: await fakeNoteModelsFor(set),
  });

describe("eval inputs", () => {
  test("a photo reference cannot leave the set", async () => {
    const set = await copySet();
    const file = join(set, "scenarios/s001-gen3-correct.json");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace('"gen-3-plate.jpg"', '"../../secret.jpg"'),
    );
    await expect(evaluate(set)).rejects.toThrow("plain file name");
  });

  test("a missing set is an error, not an empty report", async () => {
    const models = await fakeModelsFor(SET);
    await expect(
      runEval({ set: join(SET, "nope"), projectRoot: PROJECTS, models }),
    ).rejects.toThrow("no scenarios");
  });

  test("fake models refuse multi-photo scenarios", async () => {
    const set = await copySet();
    const file = join(set, "scenarios/s001-gen3-correct.json");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace(
        '["gen-3-plate.jpg"]',
        '["gen-3-plate.jpg", "cat-plate.jpg"]',
      ),
    );
    await expect(evaluate(set)).rejects.toThrow("one photo");
  });

  test("an unreadable label scores abstention as right and a value as wrong", async () => {
    const set = await copySet();
    const file = join(set, "labels/cat-plate.json");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace('"serial": "SBK00921"', '"serial": "unreadable"'),
    );
    const r = await evaluate(set);
    expect(r.fields.find((f) => f.photo === "cat-plate.jpg" && f.field === "serial")?.correct).toBe(
      false,
    );
  });
});

describe("number handling", () => {
  test("thousands commas are one number", () => {
    expect(firstNumber("2,250 kVA")).toBe(2250);
    expect(fieldMatches("kva", "2250", "2,250 kVA")).toBe(true);
  });

  test("tags compare the way the linker does", () => {
    expect(fieldMatches("tag", "GEN-3", "Generator 3")).toBe(true);
  });
});

describe("runEval on the fixture set", () => {
  test("nothing to measure reads as n/a, not 0%", async () => {
    const set = await copySet();
    await rm(join(set, "labels"), { recursive: true });
    const r = await evaluate(set);
    expect(r.fieldAccuracy).toBeNull();
    expect(renderReport(r)).toContain("| Field accuracy | n/a |");
  });

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
    const set = await copySet();
    const file = join(set, "scenarios/s002-gen3-wrong-pad.json");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace('"status": "flagged"', '"status": "confirmed"'),
    );
    expect((await evaluate(set)).verdictAccuracy).toBeCloseTo(2 / 3, 9);
  });

  test("the report shows the headline metrics and per-kind accuracy", async () => {
    const md = renderReport(await evaluate());
    expect(md).toContain("| Verdict accuracy | 100.0% |");
    expect(md).toContain("| Coverage (not handed to a human) | 66.7% |");
    expect(md).toContain("Fabricated");
    expect(md).toContain("not_in_project");
  });
});

describe("site note eval", () => {
  const evalNotes = async (set = SET) =>
    runEval({
      set,
      projectRoot: PROJECTS,
      models: await fakeModelsFor(set),
      noteModels: await fakeNoteModelsFor(set),
    });

  test("note metrics on the fixture set", async () => {
    const r = await evalNotes();
    expect(r.notes).not.toBeNull();
    expect(r.notes!.cases.map((c) => c.id)).toEqual([
      "n001-gen3-set",
      "n002-gen3-wrong-pad",
      "n003-delay-action",
    ]);
    expect(r.notes!.claimPrecision).toBe(1);
    expect(r.notes!.claimRecall).toBe(1);
    expect(r.notes!.statusAccuracy).toBe(1);
    expect(r.notes!.fabricated).toBe(0);
    expect(renderReport(r)).toContain("## Site notes");
  });

  test("a claim naming a tag absent from the script counts as fabricated", async () => {
    const set = await copySet();
    const file = join(set, "voice/n001-gen3-set.txt");
    await writeFile(file, "Quick update from the yard. Something is set on pad B.");
    const r = await evalNotes(set);
    expect(r.notes!.fabricated).toBe(1);
  });

  test("an audio reference cannot leave the set", async () => {
    const set = await copySet();
    const file = join(set, "voice/n001-gen3-set.json");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace('"n001-gen3-set.wav"', '"../../secret.wav"'),
    );
    await expect(evalNotes(set)).rejects.toThrow("plain file name");
  });

  test("a set without voice/ gives notes: null", async () => {
    const set = await copySet();
    await rm(join(set, "voice"), { recursive: true });
    const r = await runEval({ set, projectRoot: PROJECTS, models: await fakeModelsFor(set) });
    expect(r.notes).toBeNull();
  });

  test("a set with voice notes but no speech models is an error", async () => {
    await expect(
      runEval({ set: SET, projectRoot: PROJECTS, models: await fakeModelsFor(SET) }),
    ).rejects.toThrow("GROQ_API_KEY");
  });
});
