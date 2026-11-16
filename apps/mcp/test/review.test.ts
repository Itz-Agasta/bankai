import { afterAll, describe, expect, test } from "bun:test";
import { VerifyResult } from "@bankai/schemas";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { realpathSync, symlinkSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildContext } from "../src/context";
import { MAX_BASE64, resolvePhotos } from "../src/photos";
import { createServer } from "../src/server";
import { cleanup, connect, fakeModels, miniProject, PLATE, track } from "./helpers";

afterAll(cleanup);

const text = (r: { content?: unknown }) =>
  ((r.content as { type: string; text?: string }[]) ?? []).map((c) => c.text ?? "").join("\n");

describe("photo roots", () => {
  test("a symlink is read through the real path that was checked", async () => {
    const project = await miniProject();
    symlinkSync(join(project, "plate.jpg"), join(project, "link.jpg"));
    const ctx = track(await buildContext({ projectDir: project, models: fakeModels() }));
    expect(await resolvePhotos([{ path: "link.jpg" }], ctx)).toEqual([
      realpathSync(join(project, "plate.jpg")),
    ]);
  });

  test("a root of / allows any file", async () => {
    const project = await miniProject();
    const ctx = await buildContext({
      projectDir: project,
      models: fakeModels(),
      photoRoots: ["/"],
    });
    expect(await resolvePhotos([{ path: PLATE }], ctx)).toEqual([realpathSync(PLATE)]);
  });

  test("relative BANKAI_PHOTO_ROOTS entries resolve against the project", async () => {
    const project = await miniProject();
    process.env.BANKAI_PHOTO_ROOTS = "photos";
    try {
      const ctx = track(await buildContext({ projectDir: project, models: fakeModels() }));
      expect(ctx.photoRoots).toContain(join(project, "photos"));
    } finally {
      delete process.env.BANKAI_PHOTO_ROOTS;
    }
  });

  test("an oversized base64 photo fails input validation", async () => {
    const { client } = await connect();
    const r = await client.callTool({
      name: "verify_equipment",
      arguments: { photos: [{ base64: "A".repeat(MAX_BASE64 + 4), mediaType: "image/jpeg" }] },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/base64|too big/i);
  });
});

describe("tools", () => {
  test("an empty ticket fails input validation", async () => {
    const { client } = await connect();
    const r = await client.callTool({
      name: "check_delivery",
      arguments: { po: "PO-1042", line: 14, ticket: "" },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).not.toContain("NOT_FOUND");
  });

  test("an edit to the project files is seen without a restart", async () => {
    const { client, project } = await connect();
    const file = join(project, "deliveries.json");
    const lines = JSON.parse(await readFile(file, "utf8"));
    lines.push({ ...lines[0], line: 3, item: "controls cabinet" });
    await writeFile(file, JSON.stringify(lines));
    const r = await client.callTool({
      name: "check_delivery",
      arguments: { po: "PO-1042", line: 14, ticket: "DT-88" },
    });
    expect(VerifyResult.parse(r.structuredContent).verdict.status).toBe("confirmed");
  });

  test("explain keeps each step's input hash and time", async () => {
    const { client, project } = await connect();
    const v = await client.callTool({
      name: "verify_equipment",
      arguments: { photos: [{ path: join(project, "plate.jpg") }], location: "PAD-B" },
    });
    const id = VerifyResult.parse(v.structuredContent).verdict.id;
    const e = await client.callTool({ name: "explain", arguments: { id } });
    const trace = (e.structuredContent as { trace: Record<string, unknown>[] }).trace;
    expect(trace[0]).toHaveProperty("input_hash");
    expect(trace[0]).toHaveProperty("at");
  });
});

async function pendingUpdate(caps: Record<string, unknown>, onPrompt?: (m: string) => void) {
  const project = await miniProject();
  const ctx = track(await buildContext({ projectDir: project, models: fakeModels() }));
  const client = new Client({ name: "t", version: "0" }, { capabilities: caps });
  if (onPrompt)
    client.setRequestHandler("elicitation/create", async (req) => {
      onPrompt((req.params as { message: string }).message);
      return { action: "accept", content: { approve: true } };
    });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(ctx).connect(b);
  await client.connect(a);
  const v = await client.callTool({
    name: "verify_equipment",
    arguments: { photos: [{ path: join(project, "plate.jpg") }], location: "PAD-B" },
  });
  const id = VerifyResult.parse(v.structuredContent).proposed_updates[0]!.id;
  return () =>
    client.callTool({ name: "apply_update", arguments: { update_id: id, approved_by: "SUPT-01" } });
}

describe("apply_update prompts", () => {
  test("the prompt names the approver", async () => {
    let message = "";
    const apply = await pendingUpdate({ elicitation: {} }, (m) => (message = m));
    await apply();
    expect(message).toContain("SUPT-01");
  });

  test("a client with only URL elicitation approves on the role id", async () => {
    const apply = await pendingUpdate({ elicitation: { url: {} } });
    const r = await apply();
    expect(r.isError).toBeFalsy();
    expect((r.structuredContent as { approval: string }).approval).toBe("approved");
  });
});
