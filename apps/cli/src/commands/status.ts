import { openStore, storePath } from "@bankai/core";

export interface StatusOptions {
  project: string;
  json?: boolean;
}

/** Open items (flagged or needing a human), oldest first: what is still unresolved on site. */
export function statusCommand(opts: StatusOptions): number {
  const store = openStore(storePath(opts.project));
  try {
    const items = store.openItems();
    if (opts.json) {
      console.log(JSON.stringify(items, null, 2));
      return 0;
    }
    if (items.length === 0) console.log("No open items.");
    for (const i of items) {
      const retake = i.retake ? "  (retake requested)" : "";
      console.log(
        `${i.subject_tag ?? "unidentified"}  ${i.status}  since ${i.since.slice(0, 10)}  ${i.reason}${retake}`,
      );
    }
    return 0;
  } finally {
    store.close();
  }
}
