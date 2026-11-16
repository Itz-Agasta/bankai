import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { BankaiFailure } from "../errors";
import { PROMPT_VERSION } from "../perceive/prompts";
import { sha256Hex } from "./hash";
import type { Metered, VisionModel } from "./types";

export interface CacheOpts {
  dir: string;
  replayOnly: boolean;
}

/**
 * Disk cache keyed by prompt version, model id, call and input bytes. In replay
 * mode (D30) it never calls the model, so a demo runs with no keys. Outside
 * replay the cache is best effort: a broken entry or a failed write never
 * costs us the model's answer.
 */
export function cacheFor(modelId: string, opts: CacheOpts) {
  let warned = false;
  return async function cached<T>(
    key: (string | Uint8Array)[],
    run: () => Promise<Metered<T>>,
  ): Promise<Metered<T>> {
    const path = join(opts.dir, `${sha256Hex(PROMPT_VERSION, modelId, ...key)}.json`);
    const started = performance.now();
    const hit = await Bun.file(path)
      .json()
      .catch(() => undefined);
    if (hit !== undefined) {
      // A cache hit costs nothing; latency is the disk read.
      return {
        value: hit as T,
        cost: { model: modelId, ms: Math.round(performance.now() - started), usd: 0 },
      };
    }
    if (opts.replayOnly)
      throw new BankaiFailure(
        "PERCEPTION_UNAVAILABLE",
        "not in replay cache",
        `${modelId} ${String(key[0])}`,
      );
    const result = await run();
    try {
      await mkdir(opts.dir, { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      await Bun.write(tmp, JSON.stringify(result.value));
      await rename(tmp, path);
    } catch (e) {
      // Unwritable cache: keep the answer, say so once, so a later replay miss has a visible cause.
      if (!warned)
        console.warn(`bankai: cache write failed in ${opts.dir}: ${(e as Error).message}`);
      warned = true;
    }
    return result;
  };
}

/** Try a, then b; both failing is PERCEPTION_UNAVAILABLE naming both errors. */
export async function eitherOf<T>(
  what: string,
  ids: [string, string],
  a: () => Promise<T>,
  b: () => Promise<T>,
): Promise<T> {
  try {
    return await a();
  } catch (first) {
    try {
      return await b();
    } catch (second) {
      const detail = `${ids[0]}: ${(first as Error).message}; ${ids[1]}: ${(second as Error).message}`;
      throw new BankaiFailure("PERCEPTION_UNAVAILABLE", `${what} unavailable`, detail);
    }
  }
}

export function withCache(m: VisionModel, opts: CacheOpts): VisionModel {
  const c = cacheFor(m.id, opts);
  const cached = <T>(call: string, img: Uint8Array, run: () => Promise<Metered<T>>) =>
    c([call, img], run);
  return {
    id: m.id,
    locate: (img) => cached("locate", img, () => m.locate(img)),
    read: (img) => cached("read", img, () => m.read(img)),
    choose: m.choose
      ? (img, questions) =>
          cached(`choose:${JSON.stringify(questions)}`, img, () => m.choose!(img, questions))
      : undefined,
    components: m.components
      ? async (img, candidates) => {
          if (candidates.length === 0) return { value: [], cost: { model: m.id, ms: 0, usd: 0 } };
          const key = `components:${JSON.stringify([...candidates].sort())}`;
          return cached(key, img, () => m.components!(img, candidates));
        }
      : undefined,
  };
}

/**
 * Try the primary; on any error use the fallback; both failing is
 * PERCEPTION_UNAVAILABLE. Cache each model before wrapping, so a fallback
 * answer is stored and labelled under the fallback's own id.
 */
export function withFallback(primary: VisionModel, fallback: VisionModel): VisionModel {
  const either = <T>(a: () => Promise<T>, b: () => Promise<T>) =>
    eitherOf("vision models", [primary.id, fallback.id], a, b);
  return {
    id: `${primary.id}|${fallback.id}`,
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
    choose: (img, questions) => {
      const ask = async (m: VisionModel) => {
        if (!m.choose) throw new Error("no choose call");
        return m.choose(img, questions);
      };
      return either(
        () => ask(primary),
        () => ask(fallback),
      );
    },
    components: (img, candidates) => {
      const ask = async (m: VisionModel) => {
        if (!m.components) throw new Error("no components call");
        return m.components(img, candidates);
      };
      return either(
        () => ask(primary),
        () => ask(fallback),
      );
    },
  };
}
