import { afterAll, describe, expect, test } from "bun:test";
import { VerifyResult } from "@bankai/schemas";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanup, miniProject, ROOT } from "./helpers";

afterAll(cleanup);

const MAIN = join(ROOT, "apps/cli/src/main.ts");
const GEN = {
  manufacturer: "Cummins",
  model: "C2000D6",
  voltage: "415",
  kva: "2000",
  phase: "3",
  frequency: "50",
};

async function fakeScript(dir: string) {
  const entry = {
    "*": { plate: { x: 200, y: 150, w: 400, h: 260 }, tags: ["GEN-3"], fields: GEN },
  };
  const path = join(dir, "fake.json");
  await writeFile(path, JSON.stringify({ primary: entry, checker: entry }));
  return path;
}

describe("bankai mcp over stdio", () => {
  test("serves the four tools and verifies a plate", async () => {
    const project = await miniProject();
    const transport = new StdioClientTransport({
      command: "bun",
      args: [MAIN, "mcp", "--project", project],
      env: {
        ...(process.env as Record<string, string>),
        BANKAI_FAKE_MODELS: await fakeScript(project),
      },
      stderr: "ignore",
    });
    const client = new Client({ name: "e2e", version: "0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual([
        "verify_equipment",
        "check_delivery",
        "apply_update",
        "explain",
      ]);
      const r = await client.callTool({
        name: "verify_equipment",
        arguments: { photos: [{ path: "plate.jpg" }], location: "PAD-B" },
      });
      expect(VerifyResult.parse(r.structuredContent).verdict.status).toBe("confirmed");
    } finally {
      await client.close();
    }
  });

  test("with no project it exits 2 with one line on stderr", async () => {
    const env = { ...process.env };
    delete env.BANKAI_PROJECT;
    const proc = Bun.spawn(["bun", MAIN, "mcp"], { env, stdout: "pipe", stderr: "pipe" });
    const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    expect(code).toBe(2);
    expect(err.trim().split("\n")).toHaveLength(1);
  });
});
