import { fakeVision } from "@bankai/core";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContext, type ServerContext } from "../src/context";
import { createServer } from "../src/server";

export const ROOT = join(import.meta.dir, "../../..");
export const PLATE = join(ROOT, "packages/core/test/fixtures/plate.jpg");

const GEN = {
  manufacturer: "Cummins",
  model: "C2000D6",
  voltage: "415",
  kva: "2000",
  phase: "3",
  frequency: "50",
};

export function fakeModels(components: string[] = []) {
  const entry = {
    "*": { plate: { x: 200, y: 150, w: 400, h: 260 }, tags: ["GEN-3"], fields: GEN, components },
  };
  return { primary: fakeVision("fake-p", entry), checker: fakeVision("fake-c", entry) };
}

const temps: string[] = [];
export const cleanup = () => Promise.all(temps.map((d) => rm(d, { recursive: true, force: true })));

/** A temp copy of the mini project with the plate photo inside it. */
export async function miniProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bankai-mcp-"));
  temps.push(dir);
  const project = join(dir, "mini");
  await cp(join(ROOT, "data/fixtures/mini"), project, { recursive: true });
  await cp(PLATE, join(project, "plate.jpg"));
  return project;
}

/** In-memory client on a fresh server over a fresh mini copy. */
export async function connect(
  opts: { components?: string[]; client?: ConstructorParameters<typeof Client>[1] } = {},
): Promise<{ client: Client; ctx: ServerContext; project: string }> {
  const project = await miniProject();
  const ctx = await buildContext({ projectDir: project, models: fakeModels(opts.components) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(ctx).connect(b);
  const client = new Client({ name: "test", version: "0" }, opts.client);
  await client.connect(a);
  return { client, ctx, project };
}
