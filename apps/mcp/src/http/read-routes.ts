import { BankaiFailure, loadProject, resolveCitation } from "@bankai/core";
import { CitationKind } from "@bankai/schemas";
import { join } from "node:path";
import * as act from "../actions";
import type { ServerContext } from "../context";
import { json, safe } from "./respond";
import { UPLOAD_NAME } from "./uploads";

async function actorOf(req: Request): Promise<string> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new BankaiFailure("INPUT_UNSUPPORTED", "send JSON { approved_by }");
  }
  const by = (body as { approved_by?: unknown } | null)?.approved_by;
  // The action checks it is a role id.
  return typeof by === "string" ? by : "";
}

/** Approvals, explain, project lists, cited records and uploaded files. */
export function readRoutes(getCtx: () => ServerContext) {
  return {
    "/api/updates/:id/approve": {
      POST: safe(async (req) => json(act.approve(getCtx(), req.params.id!, await actorOf(req)))),
    },
    "/api/updates/:id/reject": {
      POST: safe(async (req) => json(act.reject(getCtx(), req.params.id!, await actorOf(req)))),
    },
    "/api/explain/:id": { GET: safe(async (req) => json(act.explain(getCtx(), req.params.id!))) },
    "/api/project": {
      GET: safe(async () => {
        const p = await loadProject(getCtx().projectDir);
        return json({
          name: p.name,
          locations: [...p.locations].sort(),
          tags: [...p.byTag.keys()].sort(),
          po_lines: p.poLines.map(({ po, line, tag, components }) => ({
            po,
            line,
            tag,
            components,
          })),
          activities: p.activities.map(({ id, name, tag }) => ({ id, name, tag })),
        });
      }),
    },
    "/api/evidence": {
      GET: safe(async (req) => {
        const q = new URL(req.url).searchParams;
        const kind = CitationKind.safeParse(q.get("kind"));
        const ref = q.get("ref");
        if (!kind.success || !ref)
          throw new BankaiFailure("INPUT_UNSUPPORTED", "send ?kind=<citation kind>&ref=<ref>");
        const citation = { kind: kind.data, ref };
        const project = await loadProject(getCtx().projectDir);
        return json({ citation, record: resolveCitation(project, citation) });
      }),
    },
    "/api/uploads/:name": {
      GET: safe(async (req) => {
        const name = req.params.name!;
        const file = Bun.file(join(getCtx().tmpDir, name));
        if (!UPLOAD_NAME.test(name) || !(await file.exists()))
          throw new BankaiFailure("NOT_FOUND", "no such upload");
        return new Response(file);
      }),
    },
  };
}
