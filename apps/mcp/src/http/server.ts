import type { Models } from "@bankai/core";
import { createMcpHandler, validateOriginHeader } from "@modelcontextprotocol/server";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import { buildContext, type ServerContext } from "../context";
import { createServer } from "../server";
import { allowedOrigins, preflight, withCors } from "./cors";
import { DEMO_MISS, demoCopy, replayModels } from "./demo";
import { json, notFound, safe, type Handler } from "./respond";
import { readRoutes } from "./read-routes";
import { apiRoutes } from "./routes";

export interface HttpServer {
  url: URL;
  stop(): Promise<void>;
  ctx(): ServerContext;
}

type Route = Handler | Partial<Record<"GET" | "POST", Handler>>;

/** In-flight requests may still hold a replaced context: close it after they finish. */
const RETIRE_MS = 120_000;

/** One Bun server: the JSON API and remote MCP at `/mcp`, over one shared context. */
export async function startHttp(opts: {
  projectDir: string;
  port?: number;
  /** Replay-only, on a throwaway copy of the project that `POST /api/demo/reset` replaces. */
  demo?: boolean;
  models?: Models;
  /** Origin hostnames allowed to call from a browser; default BANKAI_ALLOWED_ORIGINS. */
  allowedOrigins?: string[];
}): Promise<HttpServer> {
  const demo = opts.demo ?? false;
  const allowed = opts.allowedOrigins ?? allowedOrigins();
  const models = opts.models ?? (demo ? replayModels() : undefined);
  const build = async () =>
    buildContext({ projectDir: demo ? await demoCopy(opts.projectDir) : opts.projectDir, models });
  let ctx = await build();
  const getCtx = () => ctx;
  const retiring = new Set<() => Promise<void>>();
  const retire = (old: ServerContext) => {
    const done = async () => {
      retiring.delete(done);
      clearTimeout(timer);
      old.store.close();
      await rm(dirname(old.projectDir), { recursive: true, force: true });
    };
    const timer = setTimeout(done, RETIRE_MS);
    retiring.add(done);
    return done;
  };
  const mcp = createMcpHandler(() => createServer(getCtx()));

  const mcpRoute: Handler = async (req) => {
    if (!validateOriginHeader(req.headers.get("origin"), allowed).ok)
      return json({ error: { code: "FORBIDDEN", message: "origin not allowed" } }, 403);
    return mcp.fetch(req);
  };
  const routes: Record<string, Route> = {
    ...apiRoutes(getCtx, { demo, replay: demo || process.env.BANKAI_REPLAY === "1" }),
    ...readRoutes(getCtx),
    "/mcp": mcpRoute,
  };
  if (demo)
    routes["/api/demo/reset"] = {
      POST: safe(async () => {
        // Build the new context first: a request never sees a half-made one.
        const old = ctx;
        ctx = await build();
        retire(old);
        return json({ ok: true });
      }),
    };

  // Every answer carries CORS headers for a listed origin; every path answers a preflight.
  // In the demo a replay miss says what the demo can answer.
  const cors =
    (h: Handler): Handler =>
    async (req) => {
      if (req.method === "OPTIONS") return preflight(req, allowed);
      let res = await h(req);
      if (demo && res.status === 503)
        res = json({ error: { code: "PERCEPTION_UNAVAILABLE", message: DEMO_MISS } }, 503);
      return withCors(req, res, allowed);
    };
  const wrapped = Object.fromEntries(
    Object.entries(routes).map(([path, r]) => [
      path,
      typeof r === "function"
        ? cors(r)
        : {
            ...Object.fromEntries(Object.entries(r).map(([m, h]) => [m, cors(h!)])),
            OPTIONS: cors(async () => notFound()),
          },
    ]),
  );

  const server = Bun.serve({
    port: opts.port ?? 8787,
    maxRequestBodySize: 64 * 1024 * 1024,
    routes: wrapped,
    fetch: (req) =>
      req.method === "OPTIONS" ? preflight(req, allowed) : withCors(req, notFound(), allowed),
  });
  return {
    url: server.url,
    ctx: getCtx,
    async stop() {
      await server.stop(true);
      await mcp.close();
      for (const done of retiring) await done();
      ctx.store.close();
      if (demo) await rm(dirname(ctx.projectDir), { recursive: true, force: true });
    },
  };
}
