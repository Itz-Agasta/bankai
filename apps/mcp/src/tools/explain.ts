import { BankaiFailure } from "@bankai/core";
import { NoteResult, ProposedUpdate, Verdict } from "@bankai/schemas";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ServerContext } from "../context";
import { fail, ok } from "../results";

const Output = z.object({
  kind: z.enum(["verdict", "update", "note"]),
  verdict: Verdict.optional(),
  note: NoteResult.optional(),
  update: ProposedUpdate.optional(),
  trace: z.array(
    z.object({
      step: z.string(),
      input_hash: z.string(),
      summary: z.string(),
      model: z.nullable(z.string()),
      ms: z.number(),
      usd: z.number(),
      at: z.string(),
    }),
  ),
});

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
      outputSchema: Output,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        const update = ctx.store.getUpdate(id);
        // An update's source is the verdict or note that proposed it.
        const sourceId = update ? ctx.store.verdictOfUpdate(id) : id;
        const verdict = sourceId ? ctx.store.getVerdict(sourceId) : null;
        const note = sourceId && !verdict ? ctx.store.getNote(sourceId) : null;
        if (!update && !verdict && !note)
          throw new BankaiFailure("NOT_FOUND", `no verdict, note or update ${id}`);
        const trace = sourceId
          ? ctx.store.trace(sourceId).map(({ step, input_hash, summary, model, ms, usd, at }) => ({
              step,
              input_hash,
              summary,
              model,
              ms,
              usd,
              at,
            }))
          : [];
        if (update)
          return ok({
            kind: "update",
            update,
            verdict: verdict ?? undefined,
            note: note ?? undefined,
            trace,
          });
        return ok(
          verdict ? { kind: "verdict", verdict, trace } : { kind: "note", note: note!, trace },
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}
