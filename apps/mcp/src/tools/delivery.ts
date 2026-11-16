import { checkDelivery, loadProject } from "@bankai/core";
import { VerifyResult } from "@bankai/schemas";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ServerContext } from "../context";
import { PhotoInput, resolvePhotos } from "../photos";
import { fail, ok } from "../results";

const Input = z.object({
  po: z.string().min(1).describe("Purchase order number, e.g. PO-1042"),
  line: z
    .number()
    .int()
    .optional()
    .describe("PO line number; required when the PO has several lines"),
  ticket: z
    .string()
    .min(1)
    .optional()
    .describe("Delivery ticket to check, e.g. DT-88; omit to use every ticket"),
  photos: z
    .array(PhotoInput)
    .max(6)
    .optional()
    .describe("Photos of what arrived, to count components the tickets do not list"),
});

export function registerDelivery(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "check_delivery",
    {
      title: "Check delivery",
      description:
        "Check what arrived for one PO line against the delivery tickets and, optionally, photos. Returns a cited verdict on completeness and a proposed record of what is still missing.",
      inputSchema: Input,
      outputSchema: VerifyResult,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ po, line, ticket, photos }) => {
      try {
        const project = await loadProject(ctx.projectDir);
        const runId = crypto.randomUUID();
        const result = await checkDelivery(
          { po, line, ticket, photos: photos && (await resolvePhotos(photos, ctx)) },
          { project, models: ctx.models, tracer: ctx.store.tracer(runId), runId },
        );
        ctx.store.saveVerdict(result.verdict, new Date().toISOString());
        ctx.store.saveUpdates(result.verdict.id, result.proposed_updates);
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
