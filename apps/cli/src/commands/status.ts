import { BankaiFailure, loadProject, openStore, storePath } from "@bankai/core";
import { safe } from "../format";

export interface StatusOptions {
  project: string;
  json?: boolean;
}

/** Open items (flagged or needing a human), oldest first, then updates waiting for approval. */
export async function statusCommand(opts: StatusOptions): Promise<number> {
  // A typo must not read as "all clear" (and must not create a fresh empty store).
  try {
    await loadProject(opts.project);
  } catch (e) {
    if (!(e instanceof BankaiFailure)) throw e;
    if (opts.json) console.log(JSON.stringify({ error: e.toJSON() }, null, 2));
    else console.error(safe(`error ${e.code}: ${e.message}${e.detail ? ` (${e.detail})` : ""}`));
    return 2;
  }
  const store = openStore(storePath(opts.project));
  try {
    const items = store.openItems();
    const pending = store.pendingUpdates();
    if (opts.json) {
      console.log(JSON.stringify({ open_items: items, pending_updates: pending }, null, 2));
      return 0;
    }
    if (items.length === 0) console.log("No open items.");
    for (const i of items) {
      const retake = i.retake ? "  (retake requested)" : "";
      const tag = safe(i.subject_tag ?? "unidentified");
      console.log(`${tag}  ${i.status}  since ${i.since.slice(0, 10)}  ${safe(i.reason)}${retake}`);
    }
    if (pending.length) console.log("\nPending updates");
    for (const u of pending)
      console.log(safe(`${u.id}  ${u.field} on ${u.target.ref}: '${u.old}' -> '${u.new}'`));
    return 0;
  } finally {
    store.close();
  }
}
