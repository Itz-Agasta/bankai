import { loadUserEnv, modelConfig } from "./config";
import { fakeVision } from "./fake";
import { liveModels } from "./providers";
import type { VisionModel } from "./types";

export type Models = { primary: VisionModel; checker: VisionModel };

/** Live models from env, or BANKAI_FAKE_MODELS=<script.json> ({ primary, checker } fakeVision scripts) for tests. */
export async function modelsFromEnv(): Promise<Models> {
  await loadUserEnv(); // process env still wins; the file only fills gaps
  const fake = process.env.BANKAI_FAKE_MODELS;
  if (fake) {
    const script = await Bun.file(fake).json();
    return {
      primary: fakeVision("fake-primary", script.primary),
      checker: fakeVision("fake-checker", script.checker),
    };
  }
  return liveModels(modelConfig());
}
