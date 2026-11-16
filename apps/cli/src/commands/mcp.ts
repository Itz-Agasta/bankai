import { BankaiFailure } from "@bankai/core";
import { startStdio } from "@bankai/mcp";
import { safe } from "../format";

/** Serve MCP over stdio until the client hangs up. Stdout is the protocol: errors go to stderr. */
export async function mcpCommand(opts: { project?: string }): Promise<number | undefined> {
  const projectDir = opts.project ?? process.env.BANKAI_PROJECT;
  if (!projectDir) {
    console.error("error: pass --project <dir> or set BANKAI_PROJECT");
    return 2;
  }
  try {
    await startStdio({ projectDir });
    return undefined;
  } catch (e) {
    if (!(e instanceof BankaiFailure)) throw e;
    console.error(safe(`error ${e.code}: ${e.message}${e.detail ? ` (${e.detail})` : ""}`));
    return 2;
  }
}
