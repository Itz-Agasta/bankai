import {
  BankaiFailure,
  loadProject,
  modelsFromEnv,
  openStore,
  processNote,
  storePath,
} from "@bankai/core";
import { join } from "node:path";
import { formatNote, safe } from "../format";

export interface NoteOptions {
  project: string;
  json?: boolean;
}

/** Exit 0 on any result (needs_human included); 2 on a structured input or data error. */
export async function noteCommand(audio: string, opts: NoteOptions): Promise<number> {
  const project = await loadProject(opts.project).catch((e) => e);
  if (project instanceof Error) return fail(project, opts);
  const store = openStore(storePath(opts.project));
  try {
    // Cache with the project, as the MCP server does, so replay and re-runs hit the same entries.
    const { speech, extract } = await modelsFromEnv({
      cacheDir: join(opts.project, ".bankai", "cache"),
    });
    if (!speech || !extract)
      throw new BankaiFailure(
        "PERCEPTION_UNAVAILABLE",
        "speech is not configured",
        "set GROQ_API_KEY to process site notes",
      );
    const run = await processNote(
      { audio },
      { project, models: { speech, extract }, tracer: (id) => store.tracer(id) },
    );
    try {
      store.saveNote(run.result, new Date().toISOString());
      store.saveUpdates(run.result.id, run.result.updates);
    } catch (e) {
      // The model run already happened and was paid for: show the result, say it was not kept.
      console.error(
        `warning: note not saved to ${storePath(opts.project)}: ${(e as Error).message}`,
      );
    }
    console.log(opts.json ? JSON.stringify(run, null, 2) : formatNote(run));
    return 0;
  } catch (e) {
    return fail(e, opts);
  } finally {
    store.close();
  }
}

function fail(e: unknown, opts: NoteOptions): number {
  if (!(e instanceof BankaiFailure)) throw e;
  if (opts.json) console.log(JSON.stringify({ error: e.toJSON() }, null, 2));
  else console.error(safe(`error ${e.code}: ${e.message}${e.detail ? ` (${e.detail})` : ""}`));
  return 2;
}
