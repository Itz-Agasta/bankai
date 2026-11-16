import { generateText, Output, type LanguageModel } from "ai";
import sharp from "sharp";
import { z } from "zod";
import { LOCATE_PROMPT, READ_PROMPT } from "../perceive/prompts";
import { costUsd } from "./config";
import type { Fields, Located, Metered, VisionModel } from "./types";

// Model-facing schemas: plain objects, no refine/default/transform (Gemini-safe).
const LocateOut = z.object({
  plate: z.nullable(
    z.object({ ymin: z.number(), xmin: z.number(), ymax: z.number(), xmax: z.number() }),
  ),
  tags: z.array(z.string()),
});
const text = z.nullable(z.string());
const ReadOut = z.object({
  manufacturer: text,
  model: text,
  serial: text,
  tag: text,
  voltage: text,
  kva: text,
  kw: text,
  phase: text,
  frequency: text,
});

const CALL_TIMEOUT_MS = 60_000;

const mediaType = (img: Uint8Array) =>
  img[0] === 0x89 ? "image/png" : img[0] === 0x52 && img[8] === 0x57 ? "image/webp" : "image/jpeg";

/** Any AI SDK language model with image input, as a VisionModel. */
export function aiVision(id: string, model: LanguageModel): VisionModel {
  async function ask<S extends z.ZodType>(
    prompt: string,
    schema: S,
    img: Uint8Array,
  ): Promise<Metered<z.infer<S>>> {
    const started = performance.now();
    const r = await generateText({
      model,
      temperature: 0,
      // A hung call must fail so withFallback can switch models.
      timeout: CALL_TIMEOUT_MS,
      output: Output.object({ schema }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "file", data: img, mediaType: mediaType(img) },
          ],
        },
      ],
    });
    const ms = Math.round(performance.now() - started);
    const usd = costUsd(id, r.usage.inputTokens, r.usage.outputTokens);
    return { value: r.output as z.infer<S>, cost: { model: id, ms, usd } };
  }

  return {
    id,
    async locate(img) {
      const r = await ask(LOCATE_PROMPT, LocateOut, img);
      const { width = 0, height = 0 } = await sharp(img).metadata();
      const b = r.value.plate;
      const plate: Located["plate"] = b
        ? {
            x: Math.round((b.xmin / 1000) * width),
            y: Math.round((b.ymin / 1000) * height),
            w: Math.round(((b.xmax - b.xmin) / 1000) * width),
            h: Math.round(((b.ymax - b.ymin) / 1000) * height),
          }
        : null;
      const tags = r.value.tags.map((t) => t.trim()).filter((t) => t.length > 0);
      return { value: { plate, tags }, cost: r.cost };
    },
    async read(img) {
      const r = await ask(READ_PROMPT, ReadOut, img);
      const fields: Fields = {};
      for (const [k, v] of Object.entries(r.value)) if (v) fields[k as keyof Fields] = v;
      return { value: fields, cost: r.cost };
    },
  };
}
