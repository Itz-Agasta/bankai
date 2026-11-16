import type { DrawingRev, EquipmentRow, PoLine } from "@bankai/schemas";
import { normalizeLocation } from "../link/normalize";
import type { Project, ProjectData } from "./types";

export function indexProject(name: string, data: ProjectData): Project {
  const current = new Map<string, DrawingRev>();
  for (const d of data.drawings) if (d.superseded_by === null) current.set(d.drawing, d);

  const byTag = new Map<string, EquipmentRow>();
  for (const row of data.equipment) {
    if (current.get(row.drawing)?.revision === row.revision) byTag.set(row.tag, row);
  }

  const poByTag = new Map<string, PoLine>();
  for (const line of data.poLines) poByTag.set(line.tag, line);

  return {
    name,
    ...data,
    byTag,
    poByTag,
    currentRevision: (drawing) => current.get(drawing),
    locations: new Set(data.equipment.map((r) => normalizeLocation(r.location))),
  };
}
