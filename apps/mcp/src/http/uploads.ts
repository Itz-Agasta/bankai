import {
  audioMediaType,
  BankaiFailure,
  hasMetadata,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  sha256Hex,
  stripMetadata,
} from "@bankai/core";
import { mkdir, rename, writeFile } from "node:fs/promises";
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

/** Uploads are served back to the app, so a photo is stored without GPS, device or time. */
export async function cleanPhoto(bytes: Uint8Array): Promise<Uint8Array> {
  if (!hasMetadata(bytes)) return bytes;
  try {
    return await stripMetadata(bytes);
  } catch {
    throw new BankaiFailure("INPUT_UNSUPPORTED", "photo could not be read");
  }
}

/**
 * Store bytes under the tmp folder as `<sha256>.<ext>`. The name is the content: an existing
 * file is this upload, and another request may be reading it, so it is never rewritten; a new
 * one appears whole, via rename.
 */
export async function storeUpload(dir: string, bytes: Uint8Array, ext: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const p = join(dir, `${sha256Hex(bytes)}.${ext}`);
  if (!(await Bun.file(p).exists())) {
    const tmp = `${p}.${crypto.randomUUID()}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, p);
  }
  return p;
}

/**
 * Store each file of a form field, ext from the bytes. Count and size are checked before
 * anything is written. Client file names and paths are never used.
 */
export async function saveUploads(
  form: FormData,
  field: string,
  ctx: ServerContext,
  kind: "photo" | "audio",
  [min, max]: [number, number],
): Promise<string[]> {
  const values = form.getAll(field);
  if (values.length < min || values.length > max)
    throw new BankaiFailure(
      "INPUT_UNSUPPORTED",
      min === max ? `send ${min} ${field} file` : `send ${min} to ${max} ${field}`,
    );
  const limit = kind === "photo" ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  const files: File[] = [];
  for (const v of values) {
    if (typeof v === "string")
      throw new BankaiFailure("INPUT_UNSUPPORTED", `${field} must be a file upload`);
    if (v.size > limit)
      throw new BankaiFailure("INPUT_TOO_LARGE", `${kind} over ${limit / 1024 / 1024} MB`);
    files.push(v);
  }
  const out: string[] = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const sniffed = audioMediaType(bytes);
    const ext = kind === "photo" ? imageExt(bytes) : sniffed && AUDIO_EXT[sniffed];
    if (!ext)
      throw new BankaiFailure(
        "INPUT_UNSUPPORTED",
        kind === "photo" ? "photo must be jpg, png or webp" : "audio format not supported",
      );
    out.push(
      await storeUpload(ctx.tmpDir, kind === "photo" ? await cleanPhoto(bytes) : bytes, ext),
    );
  }
  return out;
}
