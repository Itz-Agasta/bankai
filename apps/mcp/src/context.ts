import {
  loadProject,
  modelsFromEnv,
  openStore,
  storePath,
  type Models,
  type Store,
} from "@bankai/core";
import { join, resolve } from "node:path";

export interface ServerContext {
  projectDir: string;
  store: Store;
  models: Models;
  /** Photo paths must resolve under one of these. */
  photoRoots: string[];
  /** Where base64 photos are written before reading. */
  tmpDir: string;
}

/**
 * Photo roots default to the project folder plus BANKAI_PHOTO_ROOTS (colon separated).
 * Not the cwd: hosts often launch servers from `/` or the home folder.
 */
export async function buildContext(opts: {
  projectDir: string;
  models?: Models;
  photoRoots?: string[];
}): Promise<ServerContext> {
  const projectDir = resolve(opts.projectDir);
  await loadProject(projectDir); // fail at startup, not on the first call
  const extra = (process.env.BANKAI_PHOTO_ROOTS ?? "").split(":").filter(Boolean);
  return {
    projectDir,
    store: openStore(storePath(projectDir)),
    models: opts.models ?? (await modelsFromEnv()),
    photoRoots: (opts.photoRoots ?? [projectDir, ...extra]).map((r) => resolve(projectDir, r)),
    tmpDir: join(projectDir, ".bankai", "tmp"),
  };
}
