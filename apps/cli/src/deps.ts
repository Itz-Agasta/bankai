import { fakeVision, liveModels, loadUserEnv, modelConfig, type VisionModel } from "@bankai/core";

type Models = { primary: VisionModel; checker: VisionModel };

/** Live models from env, or BANKAI_FAKE_MODELS=<script.json> ({ primary, checker } fakeVision scripts) for tests. */
export async function models(): Promise<Models> {
  const fake = process.env.BANKAI_FAKE_MODELS;
  if (fake) {
    const script = await Bun.file(fake).json();
    return {
      primary: fakeVision("fake-primary", script.primary),
      checker: fakeVision("fake-checker", script.checker),
    };
  }
  await loadUserEnv();
  return liveModels(modelConfig());
}
