import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startHttp } from "../src/http/server";
import { cleanup, miniProject, PLATE } from "./helpers";
import { form, startTest, stopAll } from "./http-helpers";

const stops: (() => Promise<void>)[] = [];
afterAll(async () => {
  for (const s of stops) await s();
  await stopAll();
  await cleanup();
});

type S = Awaited<ReturnType<typeof startTest>>;
const verify = (s: S) =>
  fetch(s.at("/api/verify"), {
    method: "POST",
    body: form({ photos: Bun.file(PLATE), location: "PAD-B" }),
  });
const status = async (s: S) =>
  (await (await fetch(s.at("/api/status"))).json()) as {
    open_items: unknown[];
    pending_updates: { id: string }[];
  };
const reset = (s: S) => fetch(s.at("/api/demo/reset"), { method: "POST" });

describe("demo mode", () => {
  test("demo boots on a copy: the original project gets no state", async () => {
    const s = await startTest({ demo: true });
    expect((await verify(s)).status).toBe(200);
    expect(existsSync(join(s.project, ".bankai"))).toBe(false);
    expect(s.ctx().projectDir).not.toBe(s.project);
    const h = (await (await fetch(s.at("/api/health"))).json()) as {
      demo: boolean;
      replay: boolean;
    };
    expect(h).toMatchObject({ demo: true, replay: true });
  });

  test("reset clears an approval", async () => {
    const s = await startTest({ demo: true });
    const v = (await (await verify(s)).json()) as { proposed_updates: { id: string }[] };
    const ok = await fetch(s.at(`/api/updates/${v.proposed_updates[0]!.id}/approve`), {
      method: "POST",
      body: JSON.stringify({ approved_by: "SUPT-01" }),
    });
    expect(ok.status).toBe(200);
    const before = s.ctx().projectDir;
    expect((await reset(s)).status).toBe(200);
    expect(s.ctx().projectDir).not.toBe(before);
    const st = await status(s);
    expect(st.open_items).toEqual([]);
    expect(st.pending_updates).toEqual([]);
    expect((await fetch(s.at(`/api/explain/${v.proposed_updates[0]!.id}`))).status).toBe(404);
  });

  test("a request during reset still succeeds", async () => {
    const s = await startTest({ demo: true });
    const [a, b, c] = await Promise.all([reset(s), verify(s), fetch(s.at("/api/status"))]);
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
  });

  test("two resets at once leave nothing behind after stop", async () => {
    const demos = () => readdirSync(tmpdir()).filter((d) => d.startsWith("bankai-demo-")).length;
    const before = demos();
    const s = await startTest({ demo: true });
    await Promise.all([reset(s), reset(s)]);
    await s.stop();
    expect(demos()).toBe(before);
  });

  test("a demo boot that fails leaves no copy behind", async () => {
    const demos = () => readdirSync(tmpdir()).filter((d) => d.startsWith("bankai-demo-")).length;
    const before = demos();
    const bad = await mkdtemp(join(tmpdir(), "bankai-bad-"));
    try {
      await expect(startHttp({ projectDir: bad, port: 0, demo: true })).rejects.toThrow();
      expect(demos()).toBe(before);
    } finally {
      await rm(bad, { recursive: true, force: true });
    }
  });

  test("a replay miss is 503 with the demo message", async () => {
    const project = await miniProject();
    const prev = process.env.BANKAI_CACHE_DIR;
    const empty = await mkdtemp(join(tmpdir(), "bankai-empty-cache-"));
    process.env.BANKAI_CACHE_DIR = empty;
    try {
      const s = await startHttp({ projectDir: project, port: 0, demo: true });
      stops.push(s.stop);
      const r = await fetch(new URL("/api/verify", s.url), {
        method: "POST",
        body: form({ photos: Bun.file(PLATE) }),
      });
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({
        error: {
          code: "PERCEPTION_UNAVAILABLE",
          message: "demo answers the sample photos and notes only",
        },
      });
      expect(process.env.BANKAI_REPLAY).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.BANKAI_CACHE_DIR;
      else process.env.BANKAI_CACHE_DIR = prev;
      await rm(empty, { recursive: true, force: true });
    }
  });

  test("reset outside demo is 404", async () => {
    const s = await startTest();
    expect((await reset(s)).status).toBe(404);
  });
});
