import { BankaiFailure } from "@bankai/core";
import { ActorId, ProposedUpdate } from "@bankai/schemas";
import {
  CLIENT_CAPABILITIES_META_KEY,
  inputRequired,
  inputResponse,
  type ClientCapabilities,
  type McpServer,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ServerContext } from "../context";
import { fail, ok } from "../results";

const Input = z.object({
  update_id: z
    .string()
    .min(1)
    .describe("Proposed update id (upd_...) from verify_equipment or check_delivery"),
  approved_by: ActorId.describe("Role id of the person approving, e.g. SUPT-01. Never a name"),
});

const prompt = (u: ProposedUpdate, by: string) =>
  `${by}: approve ${u.field} on ${u.target.ref}: '${u.old}' -> '${u.new}'? Evidence: ${u.evidence.map((e) => e.ref).join(", ")}`;

/** The only tool that writes: a person approves, the ledger and audit log record it. */
export function registerApply(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "apply_update",
    {
      title: "Apply update",
      description:
        "Approve one proposed record update. Call only after a person has seen the update and named their role id. The client asks the person to confirm when it can.",
      inputSchema: Input,
      outputSchema: ProposedUpdate,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ update_id, approved_by }, extra) => {
      try {
        const u = ctx.store.getUpdate(update_id);
        if (!u) throw new BankaiFailure("NOT_FOUND", `no proposed update ${update_id}`);
        if (u.approval === "approved") return ok(u);
        if (u.approval === "rejected")
          throw new BankaiFailure("APPROVAL_REQUIRED", `update ${update_id} was rejected`);

        const envelope = extra.mcpReq.envelope as Record<string, unknown> | undefined;
        const caps = (envelope?.[CLIENT_CAPABILITIES_META_KEY] ??
          server.server.getClientCapabilities()) as ClientCapabilities | undefined;
        const at = new Date().toISOString();
        // A client that cannot show a form prompt: the role id the person gave is the approval.
        // A bare `elicitation: {}` is the 2025 shape and means form.
        const e = caps?.elicitation as { form?: unknown; url?: unknown } | undefined;
        if (!e || (e.form === undefined && e.url !== undefined))
          return ok(ctx.store.approveUpdate(update_id, approved_by, at));

        const answer = inputResponse(extra.mcpReq.inputResponses, "confirm");
        if (answer.kind === "missing")
          return inputRequired({
            inputRequests: {
              confirm: inputRequired.elicit({
                message: prompt(u, approved_by),
                requestedSchema: {
                  type: "object",
                  properties: { approve: { type: "boolean", title: "Approve this update" } },
                  required: ["approve"],
                },
              }),
            },
          });
        if (
          answer.kind === "elicit" &&
          answer.action === "accept" &&
          answer.content?.approve === true
        )
          return ok(ctx.store.approveUpdate(update_id, approved_by, at));
        ctx.store.declineUpdate(update_id, approved_by, at);
        throw new BankaiFailure("APPROVAL_REQUIRED", `${approved_by} did not approve ${update_id}`);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
