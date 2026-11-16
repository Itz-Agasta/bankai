import type { Word } from "@bankai/schemas";
import type { ExtractInput } from "../models/extract";
import type { Project } from "../project/types";

/** What the extractor may pick from: current tags, activities, PO components and locations only. */
export function extractInput(words: Word[], project: Project): ExtractInput {
  return {
    words,
    tags: [...project.byTag.keys()].sort(),
    activities: project.activities.map((a) => ({ id: a.id, name: a.name })),
    components: [...new Set(project.poLines.flatMap((l) => l.components))].sort(),
    locations: [...project.locations].sort(),
  };
}
