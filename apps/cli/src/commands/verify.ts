import {
  BankaiFailure,
  loadProject,
  modelsFromEnv,
  openStore,
  proposeForVerify,
  storePath,
  verifyEquipment,
} from "@bankai/core";
import { join } from "node:path";
import { formatVerdict, safe } from "../format";

export interface VerifyOptions {
  project: string;
  location?: string;
  components?: string;
  json?: boolean;
}

/** Exit 0 on any verdict (needs_human included); 2 on a structured input or data error. */
export async function verifyCommand(photos: string[], opts: VerifyOptions): Promise<number> {
  const project = await loadProject(opts.project).catch((e) => e);
  if (project instanceof Error) return fail(project, opts);
  // Every verdict and its step trail is kept, so open items survive to the next site walk (D28, D29).
  const store = openStore(storePath(opts.project));
  const runId = crypto.randomUUID();
  try {
    const observedComponents = opts.components
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const verdict = await verifyEquipment(
      { photos, location: opts.location ?? null, observedComponents },
      {
        project,
        models: await modelsFromEnv({ cacheDir: join(opts.project, ".bankai", "cache") }),
        tracer: store.tracer(runId),
        runId,
      },
    );
    try {
      store.saveVerdict(verdict, new Date().toISOString());
    } catch (e) {
      // The model run already happened and was paid for: show the verdict, say it was not kept.
      console.error(
        `warning: verdict not saved to ${storePath(opts.project)}: ${(e as Error).message}`,
      );
    }
    try {
      store.saveUpdates(verdict.id, proposeForVerify(verdict, opts.location ?? null, project));
    } catch (e) {
      console.error(`warning: proposed updates not saved: ${(e as Error).message}`);
    }
    console.log(opts.json ? JSON.stringify(verdict, null, 2) : formatVerdict(verdict));
    return 0;
  } catch (e) {
    return fail(e, opts);
  } finally {
    store.close();
  }
}

function fail(e: unknown, opts: VerifyOptions): number {
  if (!(e instanceof BankaiFailure)) throw e;
  if (opts.json) console.log(JSON.stringify({ error: e.toJSON() }, null, 2));
  else console.error(safe(`error ${e.code}: ${e.message}${e.detail ? ` (${e.detail})` : ""}`));
  return 2;
}
