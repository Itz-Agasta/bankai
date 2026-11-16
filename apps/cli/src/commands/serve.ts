import { BankaiFailure } from "@bankai/core";
import { startHttp } from "@bankai/mcp";
import { safe } from "../format";

/** Serve the JSON API until killed. */
export async function serveCommand(opts: {
  project?: string;
  port?: string;
  demo?: boolean;
}): Promise<number | undefined> {
  const projectDir = opts.project ?? process.env.BANKAI_PROJECT;
  if (!projectDir) {
    console.error("error: pass --project <dir> or set BANKAI_PROJECT");
    return 2;
  }
  const port = Number(opts.port ?? process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error("error: --port must be a port number");
    return 2;
  }
  try {
    const s = await startHttp({
      projectDir,
      port,
      demo: opts.demo || process.env.BANKAI_DEMO === "1",
    });
    console.error(`bankai serving ${s.url}`);
    // A demo copy lives in the temp folder: remove it on the way out.
    for (const sig of ["SIGINT", "SIGTERM"] as const)
      process.once(sig, () => void s.stop().finally(() => process.exit(0)));
    return undefined;
  } catch (e) {
    if (!(e instanceof BankaiFailure)) throw e;
    console.error(safe(`error ${e.code}: ${e.message}${e.detail ? ` (${e.detail})` : ""}`));
    return 2;
  }
}
