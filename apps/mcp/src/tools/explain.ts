import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { explain, ExplainOut } from "../actions";
import type { ServerContext } from "../context";
import { fail, ok } from "../results";

export function registerExplain(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "explain",
    {
      title: "Explain",
      description:
        "Show how a verdict, site note or proposed update was reached: the stored record and every pipeline step with its model, latency and cost. Use before disputing a verdict.",
      inputSchema: z.object({
        id: z
          .string()
          .min(1)
          .describe("A verdict id, a note id (note_...) or a proposed update id (upd_...)"),
      }),
      outputSchema: ExplainOut,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return ok(explain(ctx, id));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
