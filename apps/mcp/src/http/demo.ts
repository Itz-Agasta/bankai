import { liveModels, modelConfig, type Models } from "@bankai/core";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

/** A throwaway copy of the project without its `.bankai` state, so the pristine one is never written. */
export async function demoCopy(projectDir: string): Promise<string> {
  const src = resolve(projectDir);
  // Keep the folder name: it is the project's name.
  const parent = await mkdtemp(join(tmpdir(), "bankai-demo-"));
  const dest = join(parent, basename(src));
  try {
    await cp(src, dest, {
      recursive: true,
      filter: (p) => !p.slice(src.length).split(/[\\/]/).includes(".bankai"),
    });
  } catch (e) {
    await rm(parent, { recursive: true, force: true });
    throw e;
  }
  return dest;
}

/** Models that answer only from the committed replay cache; process.env is left alone. */
export function replayModels(env: Record<string, string | undefined> = process.env): Models {
  const cacheDir = resolve(env.BANKAI_CACHE_DIR || "data/replay");
  return liveModels(modelConfig({ ...env, BANKAI_REPLAY: "1", BANKAI_CACHE_DIR: cacheDir }));
}

export const DEMO_MISS = "demo answers the sample photos and notes only";
