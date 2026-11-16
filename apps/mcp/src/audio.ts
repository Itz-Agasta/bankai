import { MAX_AUDIO_BYTES } from "@bankai/core";
import { z } from "zod";
import type { ServerContext } from "./context";
import { storeUpload } from "./http/uploads";
import { allowedPath } from "./paths";

/** Base64 length of core's audio size limit: refuse before decoding. */
export const MAX_AUDIO_BASE64 = Math.ceil(MAX_AUDIO_BYTES / 3) * 4;

const EXT = {
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/flac": "flac",
} as const;

export const AudioInput = z.union([
  z.object({
    path: z.string().min(1).describe("Audio file path, absolute or relative to the project folder"),
  }),
  z.object({
    base64: z
      .string()
      .min(1)
      .max(MAX_AUDIO_BASE64)
      .describe("Audio bytes, base64, up to 25 MB decoded"),
    mediaType: z
      .enum(Object.keys(EXT) as [keyof typeof EXT, ...(keyof typeof EXT)[]])
      .describe("Audio media type"),
  }),
]);
export type AudioInput = z.infer<typeof AudioInput>;

/** A checked path, or the base64 bytes written under the project's tmp folder. */
export async function resolveAudio(input: AudioInput, ctx: ServerContext): Promise<string> {
  if ("path" in input) return allowedPath(input.path, ctx, "audio");
  return storeUpload(ctx.tmpDir, Buffer.from(input.base64, "base64"), EXT[input.mediaType]);
}
