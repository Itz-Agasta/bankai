import { BankaiFailure } from "@bankai/core";
import { ProposedUpdate, Verdict } from "@bankai/schemas";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ServerContext } from "../context";
import { fail, ok } from "../results";

const Output = z.object({
  kind: z.enum(["verdict", "update"]),
  verdict: Verdict.optional(),
  update: ProposedUpdate.optional(),
  trace: z.array(
    z.object({
      step: z.string(),
      summary: z.string(),
      model: z.nullable(z.string()),
      ms: z.number(),
      usd: z.number(),
    }),
  ),
});

export function registerExplain(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "explain",
    {
      title: "Explain",
      description:
        "Show how a verdict or proposed update was reached: the stored record and every pipeline step with its model, latency and cost. Use before disputing a verdict.",
      inputSchema: z.object({
        id: z.string().min(1).describe("A verdict id or a proposed update id (upd_...)"),
      }),
      outputSchema: Output,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        const update = ctx.store.getUpdate(id);
        const verdictId = update ? ctx.store.verdictOfUpdate(id) : id;
        const verdict = verdictId ? ctx.store.getVerdict(verdictId) : null;
        if (!update && !verdict) throw new BankaiFailure("NOT_FOUND", `no verdict or update ${id}`);
        const trace = verdictId
          ? ctx.store
              .trace(verdictId)
              .map(({ step, summary, model, ms, usd }) => ({ step, summary, model, ms, usd }))
          : [];
        return ok(
          update
            ? { kind: "update", update, verdict: verdict ?? undefined, trace }
            : { kind: "verdict", verdict: verdict!, trace },
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}
