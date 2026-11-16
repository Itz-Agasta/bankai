import { afterAll, describe, expect, test } from "bun:test";
import type { VerifyResult } from "@bankai/schemas";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { cleanup, PLATE } from "./helpers";
import { form, startTest, stopAll } from "./http-helpers";

afterAll(async () => {
  await stopAll();
  await cleanup();
});

type S = Awaited<ReturnType<typeof startTest>>;
const verify = async (s: S): Promise<VerifyResult> =>
  (await (
    await fetch(s.at("/api/verify"), {
      method: "POST",
      body: form({ photos: Bun.file(PLATE), location: "PAD-B" }),
    })
  ).json()) as VerifyResult;
const decide = (s: S, id: string, what: "approve" | "reject", by = "SUPT-01") =>
  fetch(s.at(`/api/updates/${encodeURIComponent(id)}/${what}`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ approved_by: by }),
  });

describe("HTTP routes", () => {
  test("approve and reject over HTTP", async () => {
    const s = await startTest();
    const a = (await verify(s)).proposed_updates[0]!.id;
    expect(((await (await decide(s, a, "approve")).json()) as { approval: string }).approval).toBe(
      "approved",
    );
    const s2 = await startTest();
    const b = (await verify(s2)).proposed_updates[0]!.id;
    const r = await decide(s2, b, "reject");
    expect(((await r.json()) as { approval: string }).approval).toBe("rejected");
    expect((await decide(s, a, "approve", "Ravi")).status).toBe(400);
    expect((await decide(s, "upd_nope", "approve")).status).toBe(404);
    expect((await decide(s2, b, "approve")).status).toBe(409);
  });

  test("approve with a bad JSON body is 400", async () => {
    const s = await startTest();
    const id = (await verify(s)).proposed_updates[0]!.id;
    const r = await fetch(s.at(`/api/updates/${id}/approve`), { method: "POST", body: "nope" });
    expect(r.status).toBe(400);
  });

  test("explain takes a URL-encoded id", async () => {
    const s = await startTest();
    const v = await verify(s);
    const r = await fetch(s.at(`/api/explain/${encodeURIComponent(v.proposed_updates[0]!.id)}`));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { kind: string }).kind).toBe("update");
    expect((await fetch(s.at("/api/explain/nope"))).status).toBe(404);
  });

  test("project lists locations, tags, PO lines and activities", async () => {
    const s = await startTest();
    const p = (await (await fetch(s.at("/api/project"))).json()) as {
      name: string;
      locations: string[];
      tags: string[];
      po_lines: { po: string; line: number; tag: string; components: string[] }[];
      activities: { id: string; name: string; tag: string | null }[];
    };
    expect(p.name).toBe("mini");
    expect(p.locations).toContain("PAD-B");
    expect(p.tags).toContain("GEN-3");
    expect(p.po_lines).toContainEqual(expect.objectContaining({ po: "PO-1042", line: 14 }));
    expect(p.activities.map((a) => a.id)).toContain("A30");
  });

  test("evidence resolves a PO line and a drawing", async () => {
    const s = await startTest();
    const ev = (kind: string, ref: string) =>
      fetch(s.at(`/api/evidence?kind=${kind}&ref=${encodeURIComponent(ref)}`));
    const po = (await (await ev("po_line", "PO-1042#L14")).json()) as {
      record: { line: number };
      citation: { ref: string };
    };
    expect(po.record.line).toBe(14);
    expect(po.citation.ref).toBe("PO-1042#L14");
    const dr = (await (await ev("drawing", "E-201@revC")).json()) as {
      record: { revision: string };
    };
    expect(dr.record.revision).toBe("C");
    expect((await ev("po_line", "PO-9999#L1")).status).toBe(404);
    expect((await ev("bogus", "x")).status).toBe(400);
  });

  test("an upload round-trips; bad names are 404", async () => {
    const s = await startTest();
    const v = await verify(s);
    const name = JSON.stringify(v).match(/[0-9a-f]{64}\.jpg/)![0];
    const r = await fetch(s.at(`/api/uploads/${name}`));
    expect(r.status).toBe(200);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(await Bun.file(PLATE).bytes());
    expect((await fetch(s.at("/api/uploads/..%2Fstate.db"))).status).toBe(404);
    expect((await fetch(s.at("/api/uploads/x.jpg"))).status).toBe(404);
    expect((await fetch(s.at(`/api/uploads/${"0".repeat(64)}.jpg`))).status).toBe(404);
  });

  test("CORS: listed origin gets headers, unlisted gets none", async () => {
    const s = await startTest({ allowedOrigins: ["app.test"] });
    const ok = await fetch(s.at("/api/status"), { headers: { origin: "https://app.test" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://app.test");
    expect(ok.headers.get("vary")).toContain("Origin");
    const bad = await fetch(s.at("/api/status"), { headers: { origin: "https://evil.test" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    const err = await fetch(s.at("/api/nope"), { headers: { origin: "https://app.test" } });
    expect(err.headers.get("access-control-allow-origin")).toBe("https://app.test");
  });

  test("OPTIONS preflight from a listed origin, on /api and /mcp", async () => {
    const s = await startTest({ allowedOrigins: ["app.test"] });
    for (const path of ["/mcp", "/api/verify", "/api/updates/x/approve"]) {
      const r = await fetch(s.at(path), {
        method: "OPTIONS",
        headers: { origin: "https://app.test", "access-control-request-method": "POST" },
      });
      expect(r.status).toBe(204);
      expect(r.headers.get("access-control-allow-origin")).toBe("https://app.test");
      expect(r.headers.get("access-control-allow-headers")).toContain("mcp-session-id");
    }
  });

  test("/mcp lists the five tools", async () => {
    const s = await startTest();
    const client = new Client({ name: "test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(s.at("/mcp")));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "verify_equipment",
      "check_delivery",
      "process_site_note",
      "apply_update",
      "explain",
    ]);
    await client.close();
  });

  test("/mcp with an unlisted Origin is 403", async () => {
    const s = await startTest({ allowedOrigins: ["app.test"] });
    const r = await fetch(s.at("/mcp"), {
      method: "POST",
      headers: { origin: "https://evil.test", "content-type": "application/json" },
      body: "{}",
    });
    expect(r.status).toBe(403);
  });
});
