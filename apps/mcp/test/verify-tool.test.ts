import { afterAll, describe, expect, test } from "bun:test";
import { VerifyResult } from "@bankai/schemas";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, connect, PLATE } from "./helpers";

afterAll(cleanup);

const text = (r: { content?: unknown }) =>
  ((r.content as { type: string; text?: string }[]) ?? []).map((c) => c.text ?? "").join("\n");

describe("verify_equipment", () => {
  test("is listed read-only", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["verify_equipment"]);
    expect(tools[0]!.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    expect(tools[0]!.outputSchema).toBeDefined();
  });

  test("a photo inside the project confirms GEN-3, saves the verdict and one pending update", async () => {
    const { client, ctx, project } = await connect();
    const r = await client.callTool({
      name: "verify_equipment",
      arguments: { photos: [{ path: join(project, "plate.jpg") }], location: "PAD-B" },
    });
    expect(r.isError).toBeFalsy();
    const out = VerifyResult.parse(r.structuredContent);
    expect(out.verdict.status).toBe("confirmed");
    expect(out.proposed_updates).toHaveLength(1);
    expect(JSON.parse(text(r))).toEqual(r.structuredContent as object);
    expect(ctx.store.getVerdict(out.verdict.id)?.status).toBe("confirmed");
    expect(ctx.store.pendingUpdates().map((u) => u.id)).toEqual([out.proposed_updates[0]!.id]);
    expect(ctx.store.trace(out.verdict.id).length).toBeGreaterThan(0);
  });

  test("a base64 photo works", async () => {
    const { client } = await connect();
    const base64 = readFileSync(PLATE).toString("base64");
    const r = await client.callTool({
      name: "verify_equipment",
      arguments: { photos: [{ base64, mediaType: "image/jpeg" }], location: "PAD-B" },
    });
    expect(r.isError).toBeFalsy();
    expect(VerifyResult.parse(r.structuredContent).verdict.status).toBe("confirmed");
  });

  test("a path outside the allowed roots is refused without reading it", async () => {
    const { client } = await connect();
    for (const path of ["/etc/passwd", "../../.env"]) {
      const r = await client.callTool({
        name: "verify_equipment",
        arguments: { photos: [{ path }] },
      });
      expect(r.isError).toBe(true);
      expect(text(r)).toContain("photo must be under");
    }
  });

  test("an empty photo is INPUT_UNSUPPORTED", async () => {
    const { client, project } = await connect();
    const empty = join(project, "empty.jpg");
    writeFileSync(empty, "");
    const r = await client.callTool({
      name: "verify_equipment",
      arguments: { photos: [{ path: empty }] },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("INPUT_UNSUPPORTED");
  });
});
