import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

export const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png"]);

/** Every file under dir, recursively, skipping dotfiles. */
export async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(
    (e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return [];
      throw e;
    },
  );
  return entries
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

export const isPhoto = (path: string) => PHOTO_EXT.has(extname(path).toLowerCase());
