import { homedir } from "node:os";
import { join } from "node:path";

/** USD per 1M tokens. Checked 2026-11-16: Gemini via pricing.fru.dev list prices, checker via OpenRouter /models. */
export const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-4-carbon": { input: 2, output: 10 },
  "gemini-4-argon": { input: 2, output: 10 },
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "openai/gpt-6.1-terra": { input: 1, output: 5 },
  // Same models routed through OpenRouter, for when a Google key is unavailable.
  "google/gemini-3.8-flash": { input: 0.83, output: 4.12 },
  "google/gemini-4-carbon": { input: 2, output: 10 },
};

export interface ModelConfig {
  vision: string;
  visionFallback: string;
  checker: string;
  speech: string;
  speechFallback: string;
  cacheDir: string;
  replayOnly: boolean;
  keys: { gemini?: string; openrouter?: string; groq?: string };
}

/** Model ids are configuration (env), never hard-coded at call sites (D32). */
export function modelConfig(
  env: Record<string, string | undefined> = process.env,
  defaults: { cacheDir?: string } = {},
): ModelConfig {
  return {
    vision: env.BANKAI_VISION_MODEL || "gemini-3.8-flash",
    visionFallback: env.BANKAI_VISION_FALLBACK_MODEL || "gemini-3.5-flash-lite",
    checker: env.BANKAI_CHECKER_MODEL || "openai/gpt-6.1-terra",
    speech: env.BANKAI_SPEECH_MODEL || "whisper-large-v3-turbo",
    speechFallback: env.BANKAI_SPEECH_FALLBACK_MODEL || "whisper-large-v3",
    cacheDir: env.BANKAI_CACHE_DIR || defaults.cacheDir || ".bankai/cache",
    replayOnly: env.BANKAI_REPLAY === "1",
    keys: {
      gemini: env.GEMINI_API_KEY,
      openrouter: env.OPENROUTER_API_KEY,
      groq: env.GROQ_API_KEY,
    },
  };
}

export function costUsd(model: string, inputTokens = 0, outputTokens = 0): number {
  const p = PRICES[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1e6;
}

const unquote = (v: string) => (/^(["']).*\1$/.test(v) ? v.slice(1, -1) : v);

/** Bun loads ./.env itself; this adds ~/.config/bankai/env without overriding anything already set. */
export async function loadUserEnv(path = join(homedir(), ".config/bankai/env")): Promise<void> {
  const file = Bun.file(path);
  if (!(await file.exists())) return;
  for (const line of (await file.text()).split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*("[^"]*"|'[^']*'|[^#]*?)\s*(?:#.*)?$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = unquote(m[2]!);
  }
}
