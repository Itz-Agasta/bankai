import { describe, expect, test } from "bun:test";
import { csvRecords, parseCsv } from "../src/project/csv";

describe("parseCsv", () => {
  test("handles quoted commas and doubled quotes", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });

  test("rejects an unterminated quote", () => {
    expect(() => parseCsv('a,b\n1,"C\n')).toThrow("line 2: unterminated quote");
  });

  test("rejects a quote inside an unquoted field", () => {
    expect(() => parseCsv('a,b\n1,ab"c\n')).toThrow("line 2: unexpected quote");
  });
});

describe("csvRecords", () => {
  test("rejects a row wider than the header", () => {
    expect(() => csvRecords("a,b\n1,2,3\n", new Set())).toThrow("line 2: 3 cells, header has 2");
  });
});
