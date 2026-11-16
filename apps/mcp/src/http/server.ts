import type { Models } from "@bankai/core";
import { createMcpHandler, validateOriginHeader } from "@modelcontextprotocol/server";
import { buildContext, type ServerContext } from "../context";
import { createServer } from "../server";
import { allowedOrigins, preflight, withCors } from "./cors";
import { json, notFound, type Handler } from "./respond";
import { readRoutes } from "./read-routes";
import { apiRoutes } from "./routes";

export interface HttpServer {
  url: URL;
  stop(): Promise<void>;
  ctx(): ServerContext;
}

type Route = Handler | Partial<Record<"GET" | "POST", Handler>>;

/** One Bun server: the JSON API and remote MCP at `/mcp`, over one shared context. */
export async function startHttp(opts: {
  projectDir: string;
  port?: number;
  demo?: boolean;
  models?: Models;
  /** Origin hostnames allowed to call from a browser; default BANKAI_ALLOWED_ORIGINS. */
  allowedOrigins?: string[];
}): Promise<HttpServer> {
  const allowed = opts.allowedOrigins ?? allowedOrigins();
  const ctx = await buildContext({ projectDir: opts.projectDir, models: opts.models });
  const getCtx = () => ctx;
  const mcp = createMcpHandler(() => createServer(getCtx()));

  const mcpRoute: Handler = async (req) => {
    if (!validateOriginHeader(req.headers.get("origin"), allowed).ok)
      return json({ error: { code: "FORBIDDEN", message: "origin not allowed" } }, 403);
    return mcp.fetch(req);
  };
  const routes: Record<string, Route> = {
    ...apiRoutes(getCtx, { demo: opts.demo ?? false, replay: process.env.BANKAI_REPLAY === "1" }),
    ...readRoutes(getCtx),
    "/mcp": mcpRoute,
  };

  // Every answer carries CORS headers for a listed origin; every path answers a preflight.
  const cors =
    (h: Handler): Handler =>
    async (req) =>
      req.method === "OPTIONS" ? preflight(req, allowed) : withCors(req, await h(req), allowed);
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
      ctx.store.close();
    },
  };
}
