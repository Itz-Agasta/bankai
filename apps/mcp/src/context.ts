import {
  loadProject,
  modelsFromEnv,
  openStore,
  storePath,
  type Models,
  type Project,
  type Store,
} from "@bankai/core";
import { join, resolve } from "node:path";

export interface ServerContext {
  projectDir: string;
  project: Project;
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
  const project = await loadProject(projectDir);
  const extra = (process.env.BANKAI_PHOTO_ROOTS ?? "").split(":").filter(Boolean);
  return {
    projectDir,
    project,
    store: openStore(storePath(projectDir)),
    models: opts.models ?? (await modelsFromEnv()),
    photoRoots: (opts.photoRoots ?? [projectDir, ...extra]).map((r) => resolve(r)),
    tmpDir: join(projectDir, ".bankai", "tmp"),
  };
}
