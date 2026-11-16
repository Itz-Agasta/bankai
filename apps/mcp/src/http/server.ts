import type { Models } from "@bankai/core";
import { buildContext, type ServerContext } from "../context";
import { notFound } from "./respond";
import { apiRoutes } from "./routes";

export interface HttpServer {
  url: URL;
  stop(): Promise<void>;
  ctx(): ServerContext;
}

/** One Bun server for the JSON API over one shared context. */
export async function startHttp(opts: {
  projectDir: string;
  port?: number;
  demo?: boolean;
  models?: Models;
}): Promise<HttpServer> {
  const ctx = await buildContext({ projectDir: opts.projectDir, models: opts.models });
  const getCtx = () => ctx;
  const server = Bun.serve({
    port: opts.port ?? 8787,
    maxRequestBodySize: 64 * 1024 * 1024,
    routes: apiRoutes(getCtx, {
      demo: opts.demo ?? false,
      replay: process.env.BANKAI_REPLAY === "1",
    }),
    fetch: notFound,
  });
  return {
    url: server.url,
    ctx: getCtx,
    async stop() {
      await server.stop(true);
      ctx.store.close();
    },
  };
}
