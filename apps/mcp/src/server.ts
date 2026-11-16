import { VERSION } from "@bankai/core";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { buildContext, type ServerContext } from "./context";
import { registerDelivery } from "./tools/delivery";
import { registerExplain } from "./tools/explain";
import { registerVerify } from "./tools/verify";

/** One server per connection over a shared context, so stdio and a later HTTP entry use the same tools. */
export function createServer(ctx: ServerContext): McpServer {
  const server = new McpServer({ name: "bankai", version: VERSION });
  // Order is what clients list: verify on arrival, delivery, then explain.
  registerVerify(server, ctx);
  registerDelivery(server, ctx);
  registerExplain(server, ctx);
  return server;
}

/** Serve over stdio, both protocol eras. Stdout is the protocol: log to stderr only. */
export async function startStdio(opts: { projectDir: string }): Promise<void> {
  const ctx = await buildContext(opts);
  serveStdio(() => createServer(ctx));
}
