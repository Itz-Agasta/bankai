import { sha256Hex } from "./hash";
import type { Fields, Located, VisionModel } from "./types";

type Script = Record<string, Located & { fields: Fields; components?: string[] }>;

/**
 * Offline model for tests. Entries are keyed by the first 12 hex chars of the
 * image sha256; "*" answers any other image (crops, which tests can't predict).
 */
export function fakeVision(id: string, script: Script): VisionModel {
  const entry = (img: Uint8Array) => {
    const e = script[sha256Hex(img).slice(0, 12)] ?? script["*"];
    if (!e) throw new Error(`fakeVision ${id}: no script for image`);
    return e;
  };
  const cost = { model: id, ms: 0, usd: 0 };
  return {
    id,
    locate: async (img) => {
      const { plate, tags } = entry(img);
      return { value: { plate, tags }, cost };
    },
    read: async (img) => ({ value: entry(img).fields, cost }),
    components: async (img, candidates) => ({
      value: (entry(img).components ?? []).filter((c) => candidates.includes(c)),
      cost,
    }),
  };
}
