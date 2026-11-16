import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { BankaiFailure } from "../errors";
import { sha256Hex } from "./hash";
import type { Metered, VisionModel } from "./types";

/**
 * Disk cache keyed by model id, call and image bytes. In replay mode (D30) it
 * never calls the model, so a demo runs with no keys.
 */
export function withCache(m: VisionModel, opts: { dir: string; replayOnly: boolean }): VisionModel {
  async function cached<T>(
    call: "locate" | "read",
    img: Uint8Array,
    run: () => Promise<Metered<T>>,
  ) {
    const path = join(opts.dir, `${sha256Hex(m.id, "\0", call, "\0", img)}.json`);
    const file = Bun.file(path);
    const started = performance.now();
    if (await file.exists()) {
      const value = (await file.json()) as T;
      // A cache hit costs nothing; latency is the disk read.
      return { value, cost: { model: m.id, ms: Math.round(performance.now() - started), usd: 0 } };
    }
    if (opts.replayOnly)
      throw new BankaiFailure("PERCEPTION_UNAVAILABLE", "not in replay cache", `${m.id} ${call}`);
    const result = await run();
    await mkdir(opts.dir, { recursive: true });
    await Bun.write(path, JSON.stringify(result.value));
    return result;
  }
  return {
    id: m.id,
    locate: (img) => cached("locate", img, () => m.locate(img)),
    read: (img) => cached("read", img, () => m.read(img)),
  };
}

/** Try the primary; on any error use the fallback; both failing is PERCEPTION_UNAVAILABLE. */
export function withFallback(primary: VisionModel, fallback: VisionModel): VisionModel {
  async function either<T>(a: () => Promise<T>, b: () => Promise<T>): Promise<T> {
    try {
      return await a();
    } catch (first) {
      try {
        return await b();
      } catch (second) {
        const detail = `${primary.id}: ${(first as Error).message}; ${fallback.id}: ${(second as Error).message}`;
        throw new BankaiFailure("PERCEPTION_UNAVAILABLE", "vision models unavailable", detail);
      }
    }
  }
  return {
    id: primary.id,
    locate: (img) =>
      either(
        () => primary.locate(img),
        () => fallback.locate(img),
      ),
    read: (img) =>
      either(
        () => primary.read(img),
        () => fallback.read(img),
      ),
  };
}
