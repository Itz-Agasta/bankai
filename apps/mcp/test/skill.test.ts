import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, connect } from "./helpers";

afterAll(cleanup);

describe("bankai skill", () => {
  test("is served as a resource that starts with its frontmatter", async () => {
    const { client } = await connect();
    const r = await client.readResource({ uri: "skill://bankai/SKILL.md" });
    const content = r.contents[0] as { text?: string };
    expect(content.text?.startsWith("---\nname: bankai")).toBe(true);
  });
});
