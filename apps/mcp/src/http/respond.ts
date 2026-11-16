import { BankaiFailure } from "@bankai/core";
import type { BankaiError } from "@bankai/schemas";

const STATUS: Record<BankaiError["code"], number> = {
  INPUT_UNSUPPORTED: 400,
  INPUT_TOO_LARGE: 413,
  NOT_FOUND: 404,
  APPROVAL_REQUIRED: 409,
  PERCEPTION_UNAVAILABLE: 503,
  PROJECT_INVALID: 500,
};

export const json = (body: unknown, status = 200): Response => Response.json(body, { status });

/** A BankaiFailure keeps its code; anything else is a bug: log it, tell the client nothing. */
export function errorResponse(e: unknown): Response {
  if (e instanceof BankaiFailure) return json({ error: e.toJSON() }, STATUS[e.code]);
  console.error(e);
  return json({ error: { code: "INTERNAL", message: "internal error" } }, 500);
}

export const notFound = (): Response =>
  json({ error: { code: "NOT_FOUND", message: "no such route" } }, 404);

export type Handler = (req: Request & { params: Record<string, string> }) => Promise<Response>;

/** Every handler answers JSON; failures map to their status. */
export const safe =
  (h: Handler): Handler =>
  async (req) => {
    try {
      return await h(req);
    } catch (e) {
      return errorResponse(e);
    }
  };
