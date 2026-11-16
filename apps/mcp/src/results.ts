import { BankaiFailure } from "@bankai/core";
import type { CallToolResult } from "@modelcontextprotocol/server";

/** Structured result plus the same JSON as text, for clients that only read content. */
export function ok(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

/** One actionable line. Anything that is not a BankaiFailure is a bug: rethrow so it surfaces. */
export function fail(e: unknown): CallToolResult {
  if (!(e instanceof BankaiFailure)) throw e;
  const text = `${e.code}: ${e.message}${e.detail ? ` (${e.detail})` : ""}`;
  return { content: [{ type: "text", text }], isError: true };
}
