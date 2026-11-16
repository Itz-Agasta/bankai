import { VerifyResult } from "@bankai/schemas";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { verify } from "../actions";
import type { ServerContext } from "../context";
import { PhotoInput, resolvePhotos } from "../photos";
import { fail, ok } from "../results";

const Input = z.object({
  photos: z
    .array(PhotoInput)
    .min(1)
    .max(6)
    .describe("1 to 6 photos of one unit: nameplate, whole unit, painted tag"),
  location: z
    .string()
    .optional()
    .describe(
      "Where the unit stands, as on the drawings, e.g. PAD-B. Needed to propose an install update",
    ),
  components: z
    .array(z.string())
    .optional()
    .describe("Components a person saw with the unit, e.g. day tank"),
});

export function registerVerify(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "verify_equipment",
    {
      title: "Verify equipment",
      description:
        "Check photos of one piece of equipment against the project's POs, submittals, current drawings and schedule. Returns a cited verdict (confirmed, flagged or needs_human) and proposed record updates that need a person's approval.",
      inputSchema: Input,
      outputSchema: VerifyResult,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ photos, location, components }) => {
      try {
        return ok(
          await verify(ctx, {
            photos: await resolvePhotos(photos, ctx),
            location: location ?? null,
            components,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}
