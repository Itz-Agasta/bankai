import { afterAll, describe, expect, test } from "bun:test";
import type { Verdict } from "@bankai/schemas";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../src/store";

const temps: string[] = [];
afterAll(() => Promise.all(temps.map((d) => rm(d, { recursive: true, force: true }))));
async function dbPath() {
  const dir = await mkdtemp(join(tmpdir(), "bankai-store-"));
  temps.push(dir);
  return join(dir, "state.db");
}

const verdict = (
  id: string,
  tag: string,
  status: Verdict["status"],
  reason = "belongs at PAD-B (E-201 rev C)",
): Verdict => ({
  id,
  subject_tag: tag,
  status,
  checks: [
    {
      name: "identity",
      result: "pass",
      reason: "linked",
      citations: [{ kind: "equipment_schedule_row", ref: `equipment_schedule.csv#${tag}` }],
      range: null,
    },
    {
      name: "location",
      result: status === "flagged" ? "fail" : "pass",
      reason,
      citations: [{ kind: "drawing", ref: "E-201@revC" }],
      range: null,
    },
  ],
  confidence: 0.9,
  retake_request: null,
  candidates: [],
  models: ["m"],
  cost_usd: 0.004,
  latency_ms: 4000,
});

describe("store", () => {
  test("open items survive a restart and clear on resolve", async () => {
    const path = await dbPath();
    let store = openStore(path);
    store.saveVerdict(verdict("v1", "GEN-3", "flagged"), "2026-11-20T10:00:00Z");
    store.saveVerdict(verdict("v2", "GEN-4", "confirmed"), "2026-11-20T10:05:00Z");
    store.close();

    store = openStore(path);
    const items = store.openItems();
    expect(items).toEqual([
      {
        verdict_id: "v1",
        subject_tag: "GEN-3",
        status: "flagged",
        reason: "belongs at PAD-B (E-201 rev C)",
        retake: false,
        since: "2026-11-20T10:00:00Z",
      },
    ]);
    expect(store.getVerdict("v1")?.subject_tag).toBe("GEN-3");
    store.resolve("v1", "SUPT-01", "2026-11-20T11:00:00Z");
    expect(store.openItems()).toEqual([]);
    store.close();
  });

  test("resolving needs a role id, never a name", async () => {
    const store = openStore(await dbPath());
    store.saveVerdict(verdict("v1", "GEN-3", "flagged"), "2026-11-20T10:00:00Z");
    expect(() => store.resolve("v1", "Agasta", "2026-11-20T11:00:00Z")).toThrow();
    store.close();
  });

  test("open items are listed oldest first", async () => {
    const store = openStore(await dbPath());
    store.saveVerdict(verdict("late", "GEN-4", "needs_human"), "2026-11-21T09:00:00Z");
    store.saveVerdict(verdict("early", "GEN-3", "flagged"), "2026-11-20T09:00:00Z");
    expect(store.openItems().map((i) => i.verdict_id)).toEqual(["early", "late"]);
    store.close();
  });

  test("re-saving a resolved verdict keeps it resolved", async () => {
    const store = openStore(await dbPath());
    const v = verdict("v1", "GEN-3", "flagged");
    store.saveVerdict(v, "2026-11-20T10:00:00Z");
    store.resolve("v1", "SUPT-01", "2026-11-20T11:00:00Z");
    store.saveVerdict(v, "2026-11-20T10:00:00Z");
    expect(store.openItems()).toEqual([]);
    store.close();
  });

  test("resolving twice or resolving nothing throws", async () => {
    const store = openStore(await dbPath());
    store.saveVerdict(verdict("v1", "GEN-3", "flagged"), "2026-11-20T10:00:00Z");
    store.resolve("v1", "SUPT-01", "2026-11-20T11:00:00Z");
    expect(() => store.resolve("v1", "SUPT-01", "2026-11-20T12:00:00Z")).toThrow("no open verdict");
    expect(() => store.resolve("nope", "SUPT-01", "2026-11-20T12:00:00Z")).toThrow(
      "no open verdict",
    );
    store.close();
  });

  test("open item reasons fall back to unknown checks, then to low confidence", async () => {
    const store = openStore(await dbPath());
    const unknownOnly = verdict("u", "GEN-3", "needs_human");
    unknownOnly.checks = [
      { name: "identity", result: "unknown", reason: "no_link", citations: [], range: null },
    ];
    unknownOnly.retake_request = { region: "equipment tag", why: "matches GEN-3, GEN-4" };
    const lowConf = verdict("c", "GEN-4", "needs_human");
    store.saveVerdict(unknownOnly, "2026-11-20T10:00:00Z");
    store.saveVerdict(lowConf, "2026-11-20T10:01:00Z");
    const [u, c] = store.openItems();
    expect(u).toMatchObject({ reason: "no_link", retake: true });
    expect(c?.reason).toBe("confidence below threshold");
    store.close();
  });

  test("the stored trace JSON carries the same id as its row", async () => {
    const path = await dbPath();
    const store = openStore(path);
    const t = store.tracer("run-j");
    t.step("locate", "i", "s");
    t.step("merge", "i", "s");
    store.close();
    const { Database } = await import("bun:sqlite");
    const db = new Database(path);
    const rows = db.query("SELECT id, json FROM trace ORDER BY seq").all() as {
      id: string;
      json: string;
    }[];
    for (const row of rows) expect(JSON.parse(row.json).id).toBe(row.id);
    db.close();
  });

  test("two tracers on one run never collide", async () => {
    const store = openStore(await dbPath());
    const a = store.tracer("run-x");
    const b = store.tracer("run-x");
    a.step("locate", "i", "s");
    b.step("read.primary", "i", "s");
    a.step("merge", "i", "s");
    expect(store.trace("run-x").map((e) => e.step)).toEqual(["locate", "read.primary", "merge"]);
    store.close();
  });

  test("a tracer's events come back in order after a restart", async () => {
    const path = await dbPath();
    let store = openStore(path);
    const t = store.tracer("run-1");
    t.step("locate", "img", "plate=yes", { model: "m", ms: 10, usd: 0.001 });
    t.step("read.primary", "crop", "7 fields");
    t.step("merge", "crop", "model,serial");
    store.close();
    store = openStore(path);
    expect(store.trace("run-1").map((e) => e.step)).toEqual(["locate", "read.primary", "merge"]);
    expect(store.trace("run-1")[0]?.usd).toBe(0.001);
    store.close();
  });
});

describe("notes in the store", () => {
  test("a note round-trips and its proposals keep their approval when the audio comes again", async () => {
    const { fakeExtractor } = await import("../src/models/extract");
    const { fakeTranscriber } = await import("../src/models/speech");
    const { memoryTracer } = await import("../src/models/meter");
    const { processNote } = await import("../src/note");
    const { loadMini } = await import("./helpers");
    const { extractScript, N001, transcript, wavFiles } = await import("./fixtures/notes");
    const project = await loadMini();
    const audio = (await wavFiles()).n001;
    const models = {
      speech: fakeTranscriber("fake-speech", { "*": transcript(N001) }),
      extract: fakeExtractor("fake-extract", extractScript()),
    };
    const store = openStore(await dbPath());
    try {
      const process = async () => {
        const r = await processNote({ audio }, { project, models, tracer: memoryTracer });
        store.saveNote(r.result, "2026-11-16T10:00:00Z");
        store.saveUpdates(r.result.id, r.result.updates);
        return r.result;
      };
      const first = await process();
      expect(store.getNote(first.id)).toEqual(first);
      const id = first.updates[0]!.id;
      store.approveUpdate(id, "SUPT-01", "2026-11-16T10:05:00Z");
      await process();
      expect(store.getUpdate(id)?.approval).toBe("approved");
      expect(store.verdictOfUpdate(id)).toBe(first.id);
      expect(store.getNote("note_missing")).toBeNull();
    } finally {
      store.close();
    }
  });
});
