import { BankaiFailure, MAX_IMAGE_BYTES, sha256Hex } from "@bankai/core";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { z } from "zod";
import type { ServerContext } from "./context";

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

const real = (p: string) => (existsSync(p) ? realpathSync(p) : p);
const under = (p: string, root: string) =>
  p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);

/** Paths are checked against the roots, symlinks resolved, before anything reads them. */
export async function resolvePhotos(inputs: PhotoInput[], ctx: ServerContext): Promise<string[]> {
  const roots = ctx.photoRoots.map(real);
  const out: string[] = [];
  for (const input of inputs) {
    if ("path" in input) {
      // Read the path that was checked, so a symlink cannot be swapped in between.
      const p = real(resolve(ctx.projectDir, input.path));
      if (!roots.some((r) => under(p, r)))
        throw new BankaiFailure("INPUT_UNSUPPORTED", `photo must be under ${roots.join(", ")}`);
      out.push(p);
    } else {
      const bytes = Buffer.from(input.base64, "base64");
      await mkdir(ctx.tmpDir, { recursive: true });
      const p = join(ctx.tmpDir, `${sha256Hex(bytes)}.${EXT[input.mediaType]}`);
      await writeFile(p, bytes);
      out.push(p);
    }
  }
  return out;
}
