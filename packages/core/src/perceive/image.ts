import sharp from "sharp";
import { BankaiFailure } from "../errors";
import type { BBox } from "../models/types";
import { hasMetadata, stripMetadata } from "./exif";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 50_000_000;
const FORMATS = new Set(["jpeg", "png", "webp"]);

/** Read a photo, refuse what we cannot or should not process, and drop its metadata (D25). */
export async function loadImage(path: string): Promise<Uint8Array> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new BankaiFailure("INPUT_UNSUPPORTED", "photo not found", path);
  if (file.size > MAX_IMAGE_BYTES) {
    throw new BankaiFailure("INPUT_TOO_LARGE", "photo over 20 MB", `${path}: ${file.size} bytes`);
  }
  return cleanImage(await file.bytes(), path);
}

/**
 * Check a photo from its header (size, pixels, format), then drop any metadata. A photo
 * without metadata comes back unchanged: re-encoding again would only blur small print.
 */
export async function cleanImage(bytes: Uint8Array, label: string): Promise<Uint8Array> {
  if (bytes.length === 0) throw new BankaiFailure("INPUT_UNSUPPORTED", "photo is empty", label);
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new BankaiFailure(
      "INPUT_TOO_LARGE",
      "photo over 20 MB",
      `${label}: ${bytes.length} bytes`,
    );
  const meta = await sharp(bytes)
    .metadata()
    .catch(() => undefined);
  const format = meta?.format;
  if (meta && (meta.width ?? 0) * (meta.height ?? 0) > MAX_PIXELS) {
    throw new BankaiFailure(
      "INPUT_TOO_LARGE",
      "photo over 50 megapixels",
      `${label}: ${meta.width}x${meta.height}`,
    );
  }
  if (!format || !FORMATS.has(format)) {
    throw new BankaiFailure(
      "INPUT_UNSUPPORTED",
      "photo must be JPEG, PNG or WebP",
      `${label}: ${format ?? "unreadable"}`,
    );
  }
  // The header can parse while the pixel data is corrupt; that surfaces on decode.
  const decodeFailed = (e: Error) => {
    throw new BankaiFailure(
      "INPUT_UNSUPPORTED",
      "photo could not be decoded",
      `${label}: ${e.message}`,
    );
  };
  if (!hasMetadata(bytes)) {
    await sharp(bytes).stats().catch(decodeFailed);
    return bytes;
  }
  const out = await stripMetadata(bytes).catch(decodeFailed);
  if (out.length > MAX_IMAGE_BYTES)
    throw new BankaiFailure("INPUT_TOO_LARGE", "photo over 20 MB", `${label}: ${out.length} bytes`);
  return out;
}

/** Crop a box plus padding on each side, clamped to the image. */
export async function cropPadded(img: Uint8Array, box: BBox, pad = 0.05): Promise<Uint8Array> {
  const { width = 0, height = 0 } = await sharp(img).metadata();
  const dx = Math.round(box.w * pad);
  const dy = Math.round(box.h * pad);
  const left = Math.max(0, Math.round(box.x) - dx);
  const top = Math.max(0, Math.round(box.y) - dy);
  const right = Math.min(width, Math.round(box.x + box.w) + dx);
  const bottom = Math.min(height, Math.round(box.y + box.h) + dy);
  if (right - left < 8 || bottom - top < 8) return img; // degenerate box: read the whole photo
  return new Uint8Array(
    await sharp(img)
      .extract({ left, top, width: right - left, height: bottom - top })
      .jpeg({ quality: 95 }) // small print needs detail; sharp defaults to 80
      .toBuffer(),
  );
}
