import { afterAll, describe, expect, test } from "bun:test";
import { ProposedUpdate, VerifyResult } from "@bankai/schemas";
import {
  Client,
  InMemoryTransport,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildContext, type ServerContext } from "../src/context";
import { createServer } from "../src/server";
import { cleanup, fakeModels, miniProject } from "./helpers";

afterAll(cleanup);

type Answer = "accept" | "reject" | "decline" | null;

const text = (r: { content?: unknown }) =>
  ((r.content as { type: string; text?: string }[]) ?? []).map((c) => c.text ?? "").join("\n");

/** A client that answers approval prompts with `answer`; null declares no elicitation at all. */
function makeClient(answer: Answer, era?: "2026") {
  const client = new Client(
    { name: "test", version: "0" },
    {
      capabilities: answer ? { elicitation: {} } : {},
      ...(era ? { versionNegotiation: { mode: { pin: "2026-07-28" } } } : {}),
    },
  );
  if (answer)
    client.setRequestHandler("elicitation/create", async () =>
      answer === "decline"
        ? { action: "decline" }
        : { action: "accept", content: { approve: answer === "accept" } },
    );
  return client;
}

async function setup(answer: Answer, era?: "2026") {
  const project = await miniProject();
  const ctx: ServerContext = await buildContext({ projectDir: project, models: fakeModels() });
  const client = makeClient(answer, era);
  if (era) {
    const handler = createMcpHandler(() => createServer(ctx));
    await client.connect(
      new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      }),
    );
  } else {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer(ctx).connect(b);
    await client.connect(a);
  }
  const v = await client.callTool({
    name: "verify_equipment",
    arguments: { photos: [{ path: join(project, "plate.jpg") }], location: "PAD-B" },
  });
  const id = VerifyResult.parse(v.structuredContent).proposed_updates[0]!.id;
  const audit = join(project, ".bankai", "audit.jsonl");
  const actions = () =>
    existsSync(audit)
      ? readFileSync(audit, "utf8")
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l).action)
      : [];
  const apply = (by = "SUPT-01") =>
    client.callTool({ name: "apply_update", arguments: { update_id: id, approved_by: by } });
  return { client, ctx, id, actions, apply };
}

describe("apply_update", () => {
  test("is listed fourth and marked as a non-destructive write", async () => {
    const { client } = await setup("accept");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "verify_equipment",
      "check_delivery",
      "process_site_note",
      "apply_update",
      "explain",
    ]);
    expect(tools[3]!.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  test("a name instead of a role id fails input validation", async () => {
    const { apply, ctx, id } = await setup("accept");
    const r = await apply("Agasta");
    expect(r.isError).toBe(true);
    expect(ctx.store.getUpdate(id)?.approval).toBe("pending");
  });

  test("an accepted prompt approves once; a replay returns the same record", async () => {
    const { apply, actions } = await setup("accept");
    const r = await apply();
    expect(r.isError).toBeFalsy();
    const u = ProposedUpdate.parse(r.structuredContent);
    expect(u).toMatchObject({ approval: "approved", approved_by: "SUPT-01" });
    expect(actions()).toEqual(["proposed", "approved"]);
    const again = await apply();
    expect(again.structuredContent).toEqual(r.structuredContent as object);
    expect(actions()).toEqual(["proposed", "approved"]);
  });

  test("an accepted prompt approves on the 2026-07-28 era too", async () => {
    const { apply, actions, client } = await setup("accept", "2026");
    expect(client.getProtocolEra()).toBe("modern");
    const r = await apply();
    expect(r.isError).toBeFalsy();
    expect(ProposedUpdate.parse(r.structuredContent).approval).toBe("approved");
    expect(actions()).toEqual(["proposed", "approved"]);
  });

  for (const answer of ["decline", "reject"] as const) {
    test(`a ${answer}d prompt leaves the update pending and logs declined`, async () => {
      const { apply, actions, ctx, id } = await setup(answer);
      const r = await apply();
      expect(r.isError).toBe(true);
      expect(text(r)).toContain("APPROVAL_REQUIRED");
      expect(ctx.store.getUpdate(id)?.approval).toBe("pending");
      expect(actions()).toEqual(["proposed", "declined"]);
    });
  }

  test("a client that cannot prompt approves on the role id alone", async () => {
    const { apply } = await setup(null);
    const r = await apply();
    expect(ProposedUpdate.parse(r.structuredContent).approval).toBe("approved");
  });

  test("an unknown update is NOT_FOUND", async () => {
    const { client } = await setup("accept");
    const r = await client.callTool({
      name: "apply_update",
      arguments: { update_id: "upd_nope", approved_by: "SUPT-01" },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("NOT_FOUND");
  });
});
