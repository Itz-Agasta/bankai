import { expect, test } from "bun:test";
import { VERSION } from "../src";

test("schemas package exports its version", () => {
  expect(VERSION).toBe("0.1.0");
});
