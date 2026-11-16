import sharp from "sharp";

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const startsWith = (b: Uint8Array, at: number, seq: number[]) =>
  seq.every((v, i) => b[at + i] === v);

function jpegHasExif(b: Uint8Array): boolean {
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1]!;
    if (marker === 0xda || marker === 0xd9) return false; // image data starts, no more metadata
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (marker === 0xe1 && startsWith(b, i + 4, EXIF_HEADER)) return true;
    i += 2 + len;
  }
  return false;
}

function pngHasExif(b: Uint8Array): boolean {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 8;
  while (i + 8 <= b.length) {
    const len = view.getUint32(i);
    const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
    if (type === "eXIf") return true;
    if (type === "IEND") return false;
    i += 12 + len;
  }
  return false;
}

/** True if a JPEG has an Exif APP1 segment or a PNG has an eXIf chunk (D25). */
export function hasExif(bytes: Uint8Array): boolean {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegHasExif(bytes);
  if (startsWith(bytes, 0, PNG_SIG)) return pngHasExif(bytes);
  return false;
}

/** Re-encode with orientation applied and every metadata block dropped (sharp's default output). */
export async function stripMetadata(bytes: Uint8Array): Promise<Uint8Array> {
  const img = sharp(bytes).autoOrient();
  const { format } = await img.metadata();
  // Nameplate text needs detail; sharp's default JPEG quality (80) blurs small print.
  const out = format === "jpeg" ? img.jpeg({ quality: 95 }) : img;
  return new Uint8Array(await out.toBuffer());
}
