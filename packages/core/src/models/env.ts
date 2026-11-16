import { loadUserEnv, modelConfig } from "./config";
import { fakeVision } from "./fake";
import { liveModels } from "./providers";
import { fakeTranscriber } from "./speech";
import type { TranscriptionModel, VisionModel } from "./types";

export type Models = {
  primary: VisionModel;
  checker: VisionModel;
  /** Absent when no speech provider is configured; site notes then report it. */
  speech?: TranscriptionModel;
};

/** Live models from env, or BANKAI_FAKE_MODELS=<script.json> ({ primary, checker, speech? } fake scripts) for tests. */
export async function modelsFromEnv(defaults: { cacheDir?: string } = {}): Promise<Models> {
  await loadUserEnv(); // process env still wins; the file only fills gaps
  const fake = process.env.BANKAI_FAKE_MODELS;
  if (fake) {
    const script = await Bun.file(fake).json();
    return {
      primary: fakeVision("fake-primary", script.primary),
      checker: fakeVision("fake-checker", script.checker),
      ...(script.speech ? { speech: fakeTranscriber("fake-speech", script.speech) } : {}),
    };
  }
  return liveModels(modelConfig(process.env, defaults));
}
