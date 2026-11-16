import { MAX_IMAGE_BYTES } from "@bankai/core";
import { z } from "zod";
import type { ServerContext } from "./context";
import { storeUpload } from "./http/uploads";
import { allowedPath } from "./paths";

/** Base64 length of core's image size limit: refuse before decoding. */
export const MAX_BASE64 = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

export const PhotoInput = z.union([
  z.object({
    path: z.string().min(1).describe("Photo file path, absolute or relative to the project folder"),
  }),
  z.object({
    base64: z.string().min(1).max(MAX_BASE64).describe("Photo bytes, base64, up to 20 MB decoded"),
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]).describe("Photo media type"),
  }),
]);
export type PhotoInput = z.infer<typeof PhotoInput>;

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

/** Paths are checked against the roots, symlinks resolved, before anything reads them. */
export async function resolvePhotos(inputs: PhotoInput[], ctx: ServerContext): Promise<string[]> {
  const out: string[] = [];
  for (const input of inputs) {
    if ("path" in input) {
      out.push(allowedPath(input.path, ctx, "photo"));
    } else {
      const bytes = Buffer.from(input.base64, "base64");
      out.push(await storeUpload(ctx.tmpDir, bytes, EXT[input.mediaType]));
    }
  }
  return out;
}
