import { VERSION } from "@bankai/core";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { buildContext, type ServerContext } from "./context";
import { registerVerify } from "./tools/verify";

/** One server per connection over a shared context, so stdio and a later HTTP entry use the same tools. */
export function createServer(ctx: ServerContext): McpServer {
  const server = new McpServer({ name: "bankai", version: VERSION });
  registerVerify(server, ctx);
  return server;
}

/** Serve over stdio, both protocol eras. Stdout is the protocol: log to stderr only. */
export async function startStdio(opts: { projectDir: string }): Promise<void> {
  const ctx = await buildContext(opts);
  serveStdio(() => createServer(ctx));
}
