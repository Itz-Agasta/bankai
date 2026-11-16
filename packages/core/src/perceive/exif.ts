import sharp from "sharp";

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const EXIF = ascii("Exif\0\0");
const XMP = ascii("http://ns.adobe.com/xap/1.0/");
const IPTC = ascii("Photoshop 3.0");
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const startsWith = (b: Uint8Array, at: number, seq: number[]) =>
  seq.every((v, i) => b[at + i] === v);

/** JPEG segments before the image data, as [marker, payload start]. */
function jpegSegments(b: Uint8Array): [number, number][] {
  const out: [number, number][] = [];
  let i = 2;
  while (i + 1 < b.length && b[i] === 0xff) {
    while (b[i + 1] === 0xff) i++; // fill bytes may precede a marker
    const marker = b[i + 1]!;
    if (marker === 0xda || marker === 0xd9) break;
    if (i + 4 > b.length) break;
    out.push([marker, i + 4]);
    i += 2 + ((b[i + 2]! << 8) | b[i + 3]!);
  }
  return out;
}

/** PNG chunks as [type, data start]. */
function pngChunks(b: Uint8Array): [string, number][] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: [string, number][] = [];
  let i = 8;
  while (i + 8 <= b.length) {
    const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
    out.push([type, i + 8]);
    if (type === "IEND") break;
    i += 12 + view.getUint32(i);
  }
  return out;
}

const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;
const isPng = (b: Uint8Array) => startsWith(b, 0, PNG_SIG);

/** True if a JPEG has an Exif APP1 segment or a PNG has an eXIf chunk (D25). */
export function hasExif(b: Uint8Array): boolean {
  if (isJpeg(b)) return jpegSegments(b).some(([m, at]) => m === 0xe1 && startsWith(b, at, EXIF));
  if (isPng(b)) return pngChunks(b).some(([t]) => t === "eXIf");
  return false;
}

/** EXIF, XMP or IPTC: any block that can carry GPS, device or time. */
export function hasMetadata(b: Uint8Array): boolean {
  if (isJpeg(b)) {
    return jpegSegments(b).some(
      ([m, at]) =>
        (m === 0xe1 && (startsWith(b, at, EXIF) || startsWith(b, at, XMP))) ||
        (m === 0xed && startsWith(b, at, IPTC)),
    );
  }
  if (isPng(b))
    return pngChunks(b).some(
      ([t, at]) => t === "eXIf" || (t === "iTXt" && startsWith(b, at, ascii("XML:com.adobe.xmp"))),
    );
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
