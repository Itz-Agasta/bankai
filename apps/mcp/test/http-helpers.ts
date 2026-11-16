import type { Models } from "@bankai/core";
import { startHttp } from "../src/http/server";
import { fakeModels, miniProject } from "./helpers";

const servers: { stop(): Promise<void> }[] = [];

/** A live server on a free port over a fresh mini copy, fake models unless given. */
export async function startTest(opts: { models?: Partial<Models>; demo?: boolean } = {}) {
  const project = await miniProject();
  const s = await startHttp({
    projectDir: project,
    port: 0,
    demo: opts.demo,
    models: { ...fakeModels(), ...opts.models },
  });
  servers.push(s);
  const at = (path: string) => new URL(path, s.url);
  return { ...s, project, at };
}

export async function stopAll() {
  for (const s of servers.splice(0)) await s.stop();
}

/** FormData from fields; a Blob array repeats the field. */
export function form(fields: Record<string, Blob | Blob[] | string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields))
    for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
}
