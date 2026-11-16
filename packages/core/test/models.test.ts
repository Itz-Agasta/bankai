import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeVision, memoryMeter, withCache, withFallback } from "../src/models";
import type { VisionModel } from "../src/models/types";

const IMG = new Uint8Array([1, 2, 3]);

function counting(inner: VisionModel) {
  const calls = { n: 0 };
  const m: VisionModel = {
    id: inner.id,
    locate: (img) => (calls.n++, inner.locate(img)),
    read: (img) => (calls.n++, inner.read(img)),
  };
  return { m, calls };
}

const fake = fakeVision("fake-a", {
  "*": { plate: null, tags: ["GEN-3"], fields: { model: "C2000D6" } },
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

describe("withFallback", () => {
  test("the fallback answers when the primary throws", async () => {
    const r = await withFallback(broken, fake).read(IMG);
    expect(r.value.model).toBe("C2000D6");
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
