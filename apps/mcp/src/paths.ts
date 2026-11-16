import { BankaiFailure } from "@bankai/core";
import { existsSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { ServerContext } from "./context";

const real = (p: string) => (existsSync(p) ? realpathSync(p) : p);
const under = (p: string, root: string) =>
  p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);

/** Resolve a client path against the project, symlinks followed, and refuse anything outside the roots. */
export function allowedPath(path: string, ctx: ServerContext, what: string): string {
  const roots = ctx.photoRoots.map(real);
  // Read the path that was checked, so a symlink cannot be swapped in between.
  const p = real(resolve(ctx.projectDir, path));
  if (!roots.some((r) => under(p, r)))
    throw new BankaiFailure("INPUT_UNSUPPORTED", `${what} must be under ${roots.join(", ")}`);
  return p;
}
