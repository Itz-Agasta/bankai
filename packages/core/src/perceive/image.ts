import sharp from "sharp";
import { BankaiFailure } from "../errors";
import type { BBox } from "../models/types";
import { stripMetadata } from "./exif";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const FORMATS = new Set(["jpeg", "png", "webp"]);

/** Read a photo, refuse what we cannot or should not process, and drop its metadata (D25). */
export async function loadImage(path: string): Promise<Uint8Array> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new BankaiFailure("INPUT_UNSUPPORTED", "photo not found", path);
  if (file.size > MAX_IMAGE_BYTES) {
    throw new BankaiFailure("INPUT_TOO_LARGE", "photo over 20 MB", `${path}: ${file.size} bytes`);
  }
  if (file.size === 0) throw new BankaiFailure("INPUT_UNSUPPORTED", "photo is empty", path);
  const bytes = await file.bytes();
  const format = await sharp(bytes)
    .metadata()
    .then((m) => m.format)
    .catch(() => undefined);
  if (!format || !FORMATS.has(format)) {
    throw new BankaiFailure(
      "INPUT_UNSUPPORTED",
      "photo must be JPEG, PNG or WebP",
      `${path}: ${format ?? "unreadable"}`,
    );
  }
  return stripMetadata(bytes);
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
      .toBuffer(),
  );
}
