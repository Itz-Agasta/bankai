import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { aiVision } from "./ai";
import { withCache, withFallback } from "./cache";
import { PRICES, type ModelConfig } from "./config";
import type { Models } from "./env";
import { aiTranscriber, SPEECH_PRICES, withSpeechCache, withSpeechFallback } from "./speech";

/**
 * Primary (Gemini with a cheaper Gemini fallback) and a checker from another family, both cached.
 * Speech (Groq Whisper) only when a Groq key is set: photo-only setups need no Groq account.
 */
export function liveModels(cfg: ModelConfig): Models {
  const google = createGoogleGenerativeAI({ apiKey: cfg.keys.gemini });
  const openrouter = createOpenRouter({ apiKey: cfg.keys.openrouter });
  const cache = { dir: cfg.cacheDir, replayOnly: cfg.replayOnly };
  // Honest cost per run: refuse a model we cannot price rather than report $0.
  for (const id of [cfg.vision, cfg.visionFallback, cfg.checker]) {
    if (!PRICES[id])
      throw new Error(`No price for model ${id}: add it to PRICES in models/config.ts`);
  }
  const vision = (id: string) => withCache(aiVision(id, google(id)), cache);
  const models: Models = {
    primary: withFallback(vision(cfg.vision), vision(cfg.visionFallback)),
    checker: withCache(aiVision(cfg.checker, openrouter(cfg.checker)), cache),
  };
  if (cfg.keys.groq) {
    for (const id of [cfg.speech, cfg.speechFallback]) {
      if (SPEECH_PRICES[id] === undefined)
        throw new Error(`No price for model ${id}: add it to SPEECH_PRICES in models/speech.ts`);
    }
    const groq = createGroq({ apiKey: cfg.keys.groq });
    const speech = (id: string) =>
      withSpeechCache(aiTranscriber(id, groq.transcription(id)), cache);
    models.speech = withSpeechFallback(speech(cfg.speech), speech(cfg.speechFallback));
  }
  return models;
}
