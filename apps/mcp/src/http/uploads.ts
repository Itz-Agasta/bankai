import { audioMediaType, BankaiFailure, sha256Hex } from "@bankai/core";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ServerContext } from "../context";

export const UPLOAD_NAME = /^[0-9a-f]{64}\.(jpg|png|webp|wav|mp3|m4a|ogg|webm|flac)$/;

const AUDIO_EXT: Record<string, string> = {
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/flac": "flac",
};

const at = (b: Uint8Array, i: number, s: string) =>
  [...s].every((ch, k) => b[i + k] === ch.charCodeAt(0));

function imageExt(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && at(b, 1, "PNG")) return "png";
  if (at(b, 0, "RIFF") && at(b, 8, "WEBP")) return "webp";
  return null;
}

/**
 * Write each file of a form field to the tmp folder as `<sha256>.<ext>`, ext from the bytes.
 * Client file names and paths are never used.
 */
export async function saveUploads(
  form: FormData,
  field: string,
  ctx: ServerContext,
  kind: "photo" | "audio",
): Promise<string[]> {
  const out: string[] = [];
  for (const v of form.getAll(field)) {
    if (typeof v === "string")
      throw new BankaiFailure("INPUT_UNSUPPORTED", `${field} must be a file upload`);
    const bytes = new Uint8Array(await v.arrayBuffer());
    const sniffed = audioMediaType(bytes);
    const ext = kind === "photo" ? imageExt(bytes) : sniffed && AUDIO_EXT[sniffed];
    if (!ext)
      throw new BankaiFailure(
        "INPUT_UNSUPPORTED",
        kind === "photo" ? "photo must be jpg, png or webp" : "audio format not supported",
      );
    await mkdir(ctx.tmpDir, { recursive: true });
    const p = join(ctx.tmpDir, `${sha256Hex(bytes)}.${ext}`);
    await writeFile(p, bytes);
    out.push(p);
  }
  return out;
}
