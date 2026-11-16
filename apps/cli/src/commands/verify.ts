import { BankaiFailure, loadProject, memoryTracer, verifyEquipment } from "@bankai/core";
import { models } from "../deps";
import { formatVerdict } from "../format";

export interface VerifyOptions {
  project: string;
  location?: string;
  components?: string;
  json?: boolean;
}

/** Exit 0 on any verdict (needs_human included); 2 on a structured input or data error. */
export async function verifyCommand(photos: string[], opts: VerifyOptions): Promise<number> {
  try {
    const observedComponents = opts.components
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const verdict = await verifyEquipment(
      { photos, location: opts.location ?? null, observedComponents },
      {
        project: await loadProject(opts.project),
        models: await models(),
        tracer: memoryTracer("cli"),
      },
    );
    console.log(opts.json ? JSON.stringify(verdict, null, 2) : formatVerdict(verdict));
    return 0;
  } catch (e) {
    if (!(e instanceof BankaiFailure)) throw e;
    if (opts.json) console.log(JSON.stringify({ error: e.toJSON() }, null, 2));
    else console.error(`error ${e.code}: ${e.message}${e.detail ? ` (${e.detail})` : ""}`);
    return 2;
  }
}
