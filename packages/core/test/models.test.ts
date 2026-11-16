import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { fakeVision, memoryMeter, sha256Hex, withCache, withFallback } from "../src/models";
import { loadUserEnv, modelConfig } from "../src/models/config";
import { liveModels } from "../src/models/providers";
import type { VisionModel } from "../src/models/types";

const IMG = new Uint8Array([1, 2, 3]);

function counting(inner: VisionModel) {
  const calls = { n: 0 };
  const m: VisionModel = {
    id: inner.id,
    locate: (img) => (calls.n++, inner.locate(img)),
    read: (img) => (calls.n++, inner.read(img)),
    components: (img, c) => (calls.n++, inner.components!(img, c)),
  };
  return { m, calls };
}

const fake = fakeVision("fake-a", {
  "*": { plate: null, tags: ["GEN-3"], fields: { model: "C2000D6" }, components: ["day tank"] },
});
const broken: VisionModel = {
  id: "broken",
  locate: () => Promise.reject(new Error("503")),
  read: () => Promise.reject(new Error("503")),
};

describe("withCache", () => {
  test("a second call with the same bytes skips the model", async () => {
    const { m, calls } = counting(fake);
    const cached = withCache(m, {
      dir: await mkdtemp(join(tmpdir(), "bankai-cache-")),
      replayOnly: false,
    });
    const first = await cached.read(IMG);
    const second = await cached.read(IMG);
    expect(calls.n).toBe(1);
    expect(second.value).toEqual(first.value);
    expect(second.cost.usd).toBe(0);
  });

  test("replay mode with an empty cache never calls the model", async () => {
    const { m, calls } = counting(fake);
    const cached = withCache(m, {
      dir: await mkdtemp(join(tmpdir(), "bankai-cache-")),
      replayOnly: true,
    });
    expect(cached.read(IMG)).rejects.toMatchObject({
      code: "PERCEPTION_UNAVAILABLE",
      message: "not in replay cache",
    });
    expect(calls.n).toBe(0);
  });
});

describe("withCache components", () => {
  test("candidate order does not change the cache key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bankai-cache-"));
    const { m, calls } = counting(fake);
    const c = withCache(m, { dir, replayOnly: false });
    expect((await c.components!(IMG, ["day tank", "generator"])).value).toEqual(["day tank"]);
    await c.components!(IMG, ["generator", "day tank"]);
    expect(calls.n).toBe(1);
  });

  test("no candidates answers empty without a model or cache entry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bankai-cache-"));
    const { m, calls } = counting(fake);
    const c = withCache(m, { dir, replayOnly: true });
    expect((await c.components!(IMG, [])).value).toEqual([]);
    expect(calls.n).toBe(0);
  });
});

describe("withCache robustness", () => {
  test("a corrupt cache file is ignored and repaired", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bankai-cache-"));
    const { m, calls } = counting(fake);
    const cached = withCache(m, { dir, replayOnly: false });
    await cached.read(IMG);
    const { readdir } = await import("node:fs/promises");
    for (const f of await readdir(dir)) await writeFile(join(dir, f), "{not json");
    expect((await cached.read(IMG)).value.model).toBe("C2000D6");
    expect(calls.n).toBe(2);
    await cached.read(IMG);
    expect(calls.n).toBe(2);
  });

  test("an unwritable cache dir still returns the model answer", async () => {
    const file = join(await mkdtemp(join(tmpdir(), "bankai-cache-")), "a-file");
    await writeFile(file, "x");
    const cached = withCache(fake, { dir: join(file, "sub"), replayOnly: false });
    expect((await cached.read(IMG)).value.model).toBe("C2000D6");
  });
});

describe("sha256Hex", () => {
  test("frames its parts", () => {
    expect(sha256Hex("ab", "c")).not.toBe(sha256Hex("a", "bc"));
  });
});

describe("loadUserEnv", () => {
  test("drops a trailing comment on unquoted values", async () => {
    const f = join(await mkdtemp(join(tmpdir(), "bankai-env-")), "env");
    await writeFile(f, "BANKAI_TEST_KEY=abc123 # note\n");
    delete process.env.BANKAI_TEST_KEY;
    await loadUserEnv(f);
    expect(process.env.BANKAI_TEST_KEY as string | undefined).toBe("abc123");
  });
});

describe("modelConfig", () => {
  test("a caller's cache dir is the default; BANKAI_CACHE_DIR still wins", () => {
    expect(modelConfig({}, { cacheDir: "/p/.bankai/cache" }).cacheDir).toBe("/p/.bankai/cache");
    expect(modelConfig({ BANKAI_CACHE_DIR: "/x" }, { cacheDir: "/p" }).cacheDir).toBe("/x");
    expect(modelConfig({}).cacheDir).toBe(".bankai/cache");
  });
});

describe("liveModels", () => {
  test("refuses a model it cannot price", () => {
    expect(() => liveModels(modelConfig({ BANKAI_CHECKER_MODEL: "someone/unpriced" }))).toThrow(
      "No price for model",
    );
  });
});

describe("withFallback", () => {
  test("the fallback answers when the primary throws", async () => {
    const r = await withFallback(broken, fake).read(IMG);
    expect(r.value.model).toBe("C2000D6");
  });

  test("components falls back when the primary throws", async () => {
    const down: VisionModel = { ...broken, components: () => Promise.reject(new Error("503")) };
    const r = await withFallback(down, fake).components!(IMG, ["day tank"]);
    expect(r.value).toEqual(["day tank"]);
  });

  test("both failing is PERCEPTION_UNAVAILABLE", async () => {
    expect(withFallback(broken, broken).read(IMG)).rejects.toMatchObject({
      code: "PERCEPTION_UNAVAILABLE",
    });
  });
});

describe("meter", () => {
  test("totals cost, latency and distinct models", () => {
    const m = memoryMeter();
    m.record("a", 100, 0.01);
    m.record("b", 50, 0.002);
    m.record("a", 10, 0);
    expect(m.total()).toEqual({ models: ["a", "b"], cost_usd: 0.012, latency_ms: 160 });
  });
});
