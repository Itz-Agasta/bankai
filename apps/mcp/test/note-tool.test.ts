import { afterAll, describe, expect, test } from "bun:test";
import { fakeExtractor, fakeTranscriber } from "@bankai/core";
import { NoteRun } from "@bankai/schemas";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractScript, N001, transcript } from "../../../packages/core/test/fixtures/notes";
import { cleanup, connect } from "./helpers";

afterAll(cleanup);

const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 9]);
const noteModels = {
  speech: fakeTranscriber("fake-speech", { "*": transcript(N001) }),
  extract: fakeExtractor("fake-extract", extractScript()),
};

const text = (r: { content?: unknown }) =>
  ((r.content as { type: string; text?: string }[]) ?? []).map((c) => c.text ?? "").join("\n");

async function withNote() {
  const c = await connect({ models: noteModels });
  const audio = join(c.project, "n001.wav");
  writeFileSync(audio, WAV);
  return { ...c, audio };
}

describe("process_site_note", () => {
  test("is listed read-only after check_delivery", async () => {
    const { client } = await withNote();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names.indexOf("process_site_note")).toBe(names.indexOf("check_delivery") + 1);
    const tool = tools.find((t) => t.name === "process_site_note")!;
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
  });

  test("process, then apply_update, then explain the update and the note", async () => {
    const { client, ctx, audio } = await withNote();
    const r = await client.callTool({
      name: "process_site_note",
      arguments: { audio: { path: audio } },
    });
    expect(r.isError).toBeFalsy();
    const run = NoteRun.parse(r.structuredContent);
    expect(run.result.status).toBe("confirmed");
    expect(ctx.store.getNote(run.result.id)?.status).toBe("confirmed");
    const upd = run.result.updates[0]!;
    expect(ctx.store.pendingUpdates().map((u) => u.id)).toEqual([upd.id]);

    const a = await client.callTool({
      name: "apply_update",
      arguments: { update_id: upd.id, approved_by: "SUPT-01" },
    });
    expect(a.isError).toBeFalsy();
    expect(ctx.store.getUpdate(upd.id)?.approval).toBe("approved");

    const eu = await client.callTool({ name: "explain", arguments: { id: upd.id } });
    expect(eu.structuredContent).toMatchObject({ kind: "update", note: { id: run.result.id } });
    const en = await client.callTool({ name: "explain", arguments: { id: run.result.id } });
    const out = en.structuredContent as { kind: string; trace: { step: string }[] };
    expect(out.kind).toBe("note");
    expect(out.trace.map((t) => t.step)).toContain("transcribe");
  });

  test("base64 audio works", async () => {
    const { client } = await withNote();
    const base64 = Buffer.from(WAV).toString("base64");
    const r = await client.callTool({
      name: "process_site_note",
      arguments: { audio: { base64, mediaType: "audio/wav" } },
    });
    expect(r.isError).toBeFalsy();
    expect(NoteRun.parse(r.structuredContent).result.status).toBe("confirmed");
  });

  test("a path outside the allowed roots is refused", async () => {
    const { client } = await withNote();
    const r = await client.callTool({
      name: "process_site_note",
      arguments: { audio: { path: "/etc/passwd" } },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toStartWith("INPUT_UNSUPPORTED");
  });

  test("no speech model is PERCEPTION_UNAVAILABLE", async () => {
    const { client, project } = await connect();
    const audio = join(project, "n001.wav");
    writeFileSync(audio, WAV);
    const r = await client.callTool({
      name: "process_site_note",
      arguments: { audio: { path: audio } },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toStartWith("PERCEPTION_UNAVAILABLE");
  });
});

describe("bankai skill", () => {
  test("teaches the walk note flow", () => {
    const md = readFileSync(join(import.meta.dir, "../../../skills/bankai/SKILL.md"), "utf8");
    expect(md).toContain("process_site_note");
  });
});
