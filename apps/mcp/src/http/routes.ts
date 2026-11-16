import { BankaiFailure, loadProject, VERSION } from "@bankai/core";
import * as act from "../actions";
import type { ServerContext } from "../context";
import { json, safe } from "./respond";
import { saveUploads } from "./uploads";

async function formOf(req: Request): Promise<FormData> {
  try {
    return await req.formData();
  } catch {
    throw new BankaiFailure("INPUT_UNSUPPORTED", "send multipart/form-data");
  }
}

const text = (f: FormData, k: string): string | undefined => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

function lineNumber(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  if (!/^\d+$/.test(s)) throw new BankaiFailure("INPUT_UNSUPPORTED", "line must be a number");
  return Number(s);
}

export function apiRoutes(getCtx: () => ServerContext, info: { demo: boolean; replay: boolean }) {
  return {
    "/api/health": {
      GET: safe(async () => {
        const project = await loadProject(getCtx().projectDir);
        return json({ ok: true, version: VERSION, ...info, project: project.name });
      }),
    },
    "/api/status": { GET: safe(async () => json(act.status(getCtx()))) },
    "/api/verify": {
      POST: safe(async (req) => {
        const ctx = getCtx();
        const f = await formOf(req);
        const photos = await saveUploads(f, "photos", ctx, "photo", [1, 6]);
        const components = text(f, "components")
          ?.split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        return json(
          await act.verify(ctx, { photos, location: text(f, "location") ?? null, components }),
        );
      }),
    },
    "/api/delivery": {
      POST: safe(async (req) => {
        const ctx = getCtx();
        const f = await formOf(req);
        const po = text(f, "po");
        if (!po) throw new BankaiFailure("INPUT_UNSUPPORTED", "po is required");
        const photos = await saveUploads(f, "photos", ctx, "photo", [0, 6]);
        return json(
          await act.delivery(ctx, {
            po,
            line: lineNumber(text(f, "line")),
            ticket: text(f, "ticket"),
            photos: photos.length ? photos : undefined,
          }),
        );
      }),
    },
    "/api/notes": {
      POST: safe(async (req) => {
        const ctx = getCtx();
        const f = await formOf(req);
        act.speechModels(ctx); // refuse before keeping the upload
        const [audio] = await saveUploads(f, "audio", ctx, "audio", [1, 1]);
        return json(await act.note(ctx, { audio: audio! }));
      }),
    },
  };
}
