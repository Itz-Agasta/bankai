import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { liveModels, loadUserEnv, memoryMeter, memoryTracer, modelConfig } from "../src/models";
import { perceivePhoto } from "../src/perceive";

// Real API calls: run with BANKAI_LIVE=1. Skipped otherwise so CI and tests stay offline.
test.skipIf(process.env.BANKAI_LIVE !== "1")(
  "live perception on plate.jpg",
  async () => {
    await loadUserEnv();
    const cfg = {
      ...modelConfig(),
      // Fresh cache: every live run makes real calls and reports real cost and latency.
      cacheDir: await mkdtemp(join(tmpdir(), "bankai-live-")),
    };
    const meter = memoryMeter();
    const tracer = memoryTracer("live");
    const r = await perceivePhoto(
      [join(import.meta.dir, "fixtures/plate.jpg")],
      liveModels(cfg),
      meter,
      tracer,
    );
    const fields = r.observations.map((o) => [o.field, o.value, o.model_votes]);
    console.log(JSON.stringify({ fields, retake: r.retake }, null, 1));
    console.log(meter.total());
    for (const e of tracer.events())
      console.log(`${e.step} ${e.model ?? ""} ${e.ms}ms $${e.usd.toFixed(5)}`);
    expect(r.noNameplate).toBe(false);
    expect(r.retake).toBeNull();
    expect(r.observations.map((o) => o.field)).toEqual(
      expect.arrayContaining(["manufacturer", "model"]),
    );
  },
  120_000,
);
