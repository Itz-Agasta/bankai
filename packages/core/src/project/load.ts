import {
  Activity,
  DeliveryLine,
  DrawingRev,
  EquipmentRow,
  PoLine,
  Submittal,
} from "@bankai/schemas";
import { basename, join } from "node:path";
import type { z } from "zod";
import { BankaiFailure } from "../errors";
import { CsvError, csvRecords } from "./csv";
import { indexProject } from "./index-project";
import type { Project } from "./types";
import { invalid, parseRows } from "./validate";

const EQUIPMENT_NUMERIC = new Set(["kva", "kw", "phase", "frequency"]);
// JSON rows are counted from 1; CSV rows carry their file line.
const jsonRow = (i: number) => i + 1;

async function readText(dir: string, file: string): Promise<string> {
  const f = Bun.file(join(dir, file));
  if (!(await f.exists())) throw invalid(file, 0, "file missing");
  return f.text();
}

async function loadCsv<T>(
  dir: string,
  file: string,
  schema: z.ZodType<T>,
  numeric = new Set<string>(),
): Promise<{ rows: T[]; lines: number[] }> {
  let recs: { line: number; record: Record<string, unknown> }[];
  try {
    recs = csvRecords(await readText(dir, file), numeric);
  } catch (e) {
    if (e instanceof CsvError) throw invalid(file, e.line, e.reason);
    throw e;
  }
  const lines = recs.map((r) => r.line);
  const rows = parseRows(
    file,
    recs.map((r) => r.record),
    schema,
    (i) => lines[i] ?? 0,
  );
  return { rows, lines };
}

async function loadJson<T>(dir: string, file: string, schema: z.ZodType<T>): Promise<T[]> {
  let rows: unknown;
  try {
    rows = JSON.parse(await readText(dir, file));
  } catch (e) {
    if (e instanceof BankaiFailure) throw e;
    throw invalid(file, 0, `not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(rows)) throw invalid(file, 0, "expected a JSON array of rows");
  return parseRows(file, rows, schema, jsonRow);
}

/** D27: best <= likely <= worst. */
function checkDurations(activities: Activity[]): void {
  activities.forEach((a, i) => {
    if (a.duration_low_days > a.duration_days || a.duration_days > a.duration_high_days) {
      throw invalid(
        "schedule.json",
        jsonRow(i),
        `${a.id}: durations must satisfy low <= likely <= high`,
      );
    }
  });
}

/** A row on an unregistered revision would silently drop out of byTag and read as "not in project". */
function checkRevisions(equipment: EquipmentRow[], lines: number[], drawings: DrawingRev[]): void {
  const current = new Map(
    drawings.filter((d) => d.superseded_by === null).map((d) => [d.drawing, d.revision]),
  );
  const key = (drawing: string, revision: string) => JSON.stringify([drawing, revision]);
  const known = new Set(drawings.map((d) => key(d.drawing, d.revision)));
  const currentTags = new Set<string>();
  equipment.forEach((r, i) => {
    if (r.revision === current.get(r.drawing)) {
      if (currentTags.has(r.tag))
        throw invalid("equipment_schedule.csv", lines[i] ?? 0, `${r.tag}: duplicate current row`);
      currentTags.add(r.tag);
    }
    if (!known.has(key(r.drawing, r.revision))) {
      const msg = `${r.tag}: ${r.drawing} rev ${r.revision} not in drawings.csv`;
      throw invalid("equipment_schedule.csv", lines[i] ?? 0, msg);
    }
  });
}

/** Exactly one current revision per drawing, so currentRevision() never depends on row order. */
function checkDrawings(drawings: DrawingRev[], lines: number[]): void {
  const current = new Set<string>();
  drawings.forEach((d, i) => {
    const line = lines[i] ?? 0;
    if ((d.superseded_by === null) !== (d.superseded_on === null)) {
      throw invalid(
        "drawings.csv",
        line,
        `${d.drawing} rev ${d.revision}: superseded_by and superseded_on must both be set or both empty`,
      );
    }
    if (d.superseded_by !== null) {
      const next = d.superseded_by;
      if (!drawings.some((o) => o.drawing === d.drawing && o.revision === next)) {
        throw invalid(
          "drawings.csv",
          line,
          `${d.drawing} rev ${d.revision}: superseded_by ${next} is not a revision of ${d.drawing}`,
        );
      }
      return;
    }
    if (current.has(d.drawing)) {
      throw invalid("drawings.csv", line, `${d.drawing}: more than one current revision`);
    }
    current.add(d.drawing);
  });
  for (const d of new Set(drawings.map((r) => r.drawing))) {
    if (!current.has(d)) throw invalid("drawings.csv", 0, `${d}: no current revision`);
  }
}

export async function loadProject(dir: string): Promise<Project> {
  const [equipment, drawings, poLines, submittals, activities, deliveries] = await Promise.all([
    loadCsv(dir, "equipment_schedule.csv", EquipmentRow, EQUIPMENT_NUMERIC),
    loadCsv(dir, "drawings.csv", DrawingRev),
    loadJson(dir, "purchase_orders.json", PoLine),
    loadJson(dir, "submittals.json", Submittal),
    loadJson(dir, "schedule.json", Activity),
    loadJson(dir, "deliveries.json", DeliveryLine),
  ]);
  checkDurations(activities);
  checkDrawings(drawings.rows, drawings.lines);
  checkRevisions(equipment.rows, equipment.lines, drawings.rows);
  return indexProject(basename(dir), {
    equipment: equipment.rows,
    drawings: drawings.rows,
    poLines,
    submittals,
    activities,
    deliveries,
  });
}
