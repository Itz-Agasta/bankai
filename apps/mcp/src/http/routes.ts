import { BankaiFailure, loadProject, VERSION } from "@bankai/core";
import * as act from "../actions";
import type { ServerContext } from "../context";
import { errorResponse, json } from "./respond";
import { saveUploads } from "./uploads";

type Handler = (req: Request & { params: Record<string, string> }) => Promise<Response>;
type Get = () => ServerContext;

/** Every handler answers JSON; failures map to their status. */
const safe =
  (h: Handler): Handler =>
  async (req) => {
    try {
      return await h(req);
    } catch (e) {
      return errorResponse(e);
    }
  };

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

function count(paths: string[], min: number, field: string): string[] {
  if (paths.length < min || paths.length > 6)
    throw new BankaiFailure("INPUT_UNSUPPORTED", `send ${min} to 6 ${field}`);
  return paths;
}

function lineNumber(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  if (!/^\d+$/.test(s)) throw new BankaiFailure("INPUT_UNSUPPORTED", "line must be a number");
  return Number(s);
}

export function apiRoutes(getCtx: Get, info: { demo: boolean; replay: boolean }) {
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
        const photos = count(await saveUploads(f, "photos", ctx, "photo"), 1, "photos");
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
        const photos = count(await saveUploads(f, "photos", ctx, "photo"), 0, "photos");
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
        const audio = await saveUploads(f, "audio", ctx, "audio");
        if (audio.length !== 1) throw new BankaiFailure("INPUT_UNSUPPORTED", "send one audio file");
        return json(await act.note(ctx, { audio: audio[0]! }));
      }),
    },
  };
}
