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
