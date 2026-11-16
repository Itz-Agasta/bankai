import { afterAll, describe, expect, test } from "bun:test";
import { VerifyResult } from "@bankai/schemas";
import { join } from "node:path";
import { cleanup, connect } from "./helpers";

afterAll(cleanup);

const text = (r: { content?: unknown }) =>
  ((r.content as { type: string; text?: string }[]) ?? []).map((c) => c.text ?? "").join("\n");

describe("check_delivery and explain", () => {
  test("tools are listed in order", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "verify_equipment",
      "check_delivery",
      "process_site_note",
      "apply_update",
      "explain",
    ]);
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.check_delivery!.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: true,
    });
    expect(byName.explain!.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
  });

  test("a short delivery is flagged with one proposal and is saved", async () => {
    const { client, ctx } = await connect();
    const r = await client.callTool({
      name: "check_delivery",
      arguments: { po: "PO-1042", line: 14, ticket: "DT-88" },
    });
    expect(r.isError).toBeFalsy();
    const out = VerifyResult.parse(r.structuredContent);
    expect(out.verdict.status).toBe("flagged");
    expect(out.proposed_updates).toHaveLength(1);
    expect(ctx.store.getVerdict(out.verdict.id)?.status).toBe("flagged");
    expect(ctx.store.pendingUpdates()).toHaveLength(1);
  });

  test("explain returns a verdict's trace, and an update's verdict trace", async () => {
    const { client, project } = await connect();
    const v = await client.callTool({
      name: "verify_equipment",
      arguments: { photos: [{ path: join(project, "plate.jpg") }], location: "PAD-B" },
    });
    const out = VerifyResult.parse(v.structuredContent);

    const ev = await client.callTool({ name: "explain", arguments: { id: out.verdict.id } });
    expect(ev.isError).toBeFalsy();
    const e = ev.structuredContent as {
      kind: string;
      verdict: { id: string };
      trace: { step: string }[];
    };
    expect(e.kind).toBe("verdict");
    expect(e.verdict.id).toBe(out.verdict.id);
    expect(e.trace.map((t) => t.step).slice(-3)).toEqual(["link", "rules", "decide"]);

    const eu = await client.callTool({
      name: "explain",
      arguments: { id: out.proposed_updates[0]!.id },
    });
    const u = eu.structuredContent as { kind: string; update: { id: string }; trace: unknown[] };
    expect(u.kind).toBe("update");
    expect(u.update.id).toBe(out.proposed_updates[0]!.id);
    expect(u.trace).toEqual(e.trace);
  });

  test("explain on an unknown id is NOT_FOUND", async () => {
    const { client } = await connect();
    const r = await client.callTool({ name: "explain", arguments: { id: "nope" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("NOT_FOUND");
  });
});
