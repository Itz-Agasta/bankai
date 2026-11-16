import { beforeAll, describe, expect, test } from "bun:test";
import type { Word } from "@bankai/schemas";
import { MockLanguageModelV4 } from "ai/test";
import { aiExtractor, fakeExtractor, type RawClaim } from "../src/models/extract";
import { extractInput } from "../src/note/extract";
import type { Project } from "../src/project/types";
import { loadMini } from "./helpers";

let mini: Project;
beforeAll(async () => {
  mini = await loadMini();
});

const words = (...t: string[]): Word[] => t.map((text, i) => ({ i, text, start: i, end: i + 1 }));

const CLAIM: RawClaim = {
  type: "status",
  word_start: 0,
  word_end: 5,
  tag: "GEN-3",
  activity_id: null,
  status_value: "set",
  location: "PAD-B",
  delay_days: null,
  spoken_date: null,
  component: null,
  issue_kind: null,
  owner_role: null,
  text: "GEN-3 set on PAD-B",
};

function mockModel(claims: RawClaim[]) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: JSON.stringify({ claims, names: [] }) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 100, text: 100, reasoning: 0 },
      },
      warnings: [],
    },
  });
}

describe("extractInput", () => {
  test("lists current tags, activities, PO components and locations", () => {
    const input = extractInput(words("Gen", "three"), mini);
    expect(input.tags).toContain("GEN-3");
    expect(input.activities).toContainEqual({ id: "A10", name: "Set GEN-3" });
    expect(input.components).toContain("controls cabinet");
    expect(new Set(input.components).size).toBe(input.components.length);
    expect(input.locations).toContain("PAD-B");
  });
});

describe("aiExtractor", () => {
  test("sends the numbered words and the lists", async () => {
    const model = mockModel([]);
    await aiExtractor("gemini-3.8-flash", model).extract(
      extractInput(words("Gen", "three", "is", "set"), mini),
    );
    const sent = JSON.stringify(model.doGenerateCalls[0]!.prompt);
    expect(sent).toContain("0:Gen 1:three 2:is 3:set");
    expect(sent).toContain("GEN-3");
    expect(sent).toContain("A10 Set GEN-3");
  });

  test("returns the schema output and its cost", async () => {
    const r = await aiExtractor("gemini-3.8-flash", mockModel([CLAIM])).extract(
      extractInput(words("Gen", "three"), mini),
    );
    expect(r.value).toEqual({ claims: [CLAIM], names: [] });
    expect(r.cost.model).toBe("gemini-3.8-flash");
    expect(r.cost.usd).toBeCloseTo((1000 * 0.75 + 100 * 3.75) / 1e6, 10);
  });
});

describe("fakeExtractor", () => {
  test("answers by the words it is given", async () => {
    const input = extractInput(words("Gen", "three"), mini);
    const other = extractInput(words("TX", "one"), mini);
    const { sha256Hex } = await import("../src/models/hash");
    const key = sha256Hex("Gen three").slice(0, 12);
    const fake = fakeExtractor("fake-extract", { [key]: [CLAIM], "*": [] });
    expect((await fake.extract(input)).value.claims).toEqual([CLAIM]);
    expect((await fake.extract(other)).value.claims).toEqual([]);
  });
});
