import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { aiVision } from "./ai";
import { withCache, withFallback } from "./cache";
import type { ModelConfig } from "./config";
import type { VisionModel } from "./types";

/** Primary (Gemini with a cheaper Gemini fallback) and a checker from another family, both cached. */
export function liveModels(cfg: ModelConfig): { primary: VisionModel; checker: VisionModel } {
  const google = createGoogleGenerativeAI({ apiKey: cfg.keys.gemini });
  const openrouter = createOpenRouter({ apiKey: cfg.keys.openrouter });
  const cache = { dir: cfg.cacheDir, replayOnly: cfg.replayOnly };
  const primary = withFallback(
    aiVision(cfg.vision, google(cfg.vision)),
    aiVision(cfg.visionFallback, google(cfg.visionFallback)),
  );
  return {
    primary: withCache(primary, cache),
    checker: withCache(aiVision(cfg.checker, openrouter(cfg.checker)), cache),
  };
}
