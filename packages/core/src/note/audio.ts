import { BankaiFailure } from "../errors";
import { sha256Hex } from "../models/hash";
import { audioMediaType } from "../models/speech";

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Read a walk note, refusing what Whisper cannot take. Only the bytes ever leave the server. */
export async function loadAudio(
  path: string,
): Promise<{ bytes: Uint8Array; hash: string; mediaType: string }> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new BankaiFailure("INPUT_UNSUPPORTED", "audio not found", path);
  if (file.size > MAX_AUDIO_BYTES)
    throw new BankaiFailure("INPUT_TOO_LARGE", "audio over 25 MB", `${path}: ${file.size} bytes`);
  if (file.size === 0) throw new BankaiFailure("INPUT_UNSUPPORTED", "audio is empty", path);
  const bytes = await file.bytes();
  const mediaType = audioMediaType(bytes);
  if (!mediaType)
    throw new BankaiFailure(
      "INPUT_UNSUPPORTED",
      "audio must be wav, mp3, m4a, ogg, webm or flac",
      path,
    );
  return { bytes, hash: sha256Hex(bytes), mediaType };
}
