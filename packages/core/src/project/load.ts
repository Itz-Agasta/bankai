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
import { csvRecords } from "./csv";
import { indexProject } from "./index-project";
import type { Project } from "./types";
import { invalid, parseRows } from "./validate";

const EQUIPMENT_NUMERIC = new Set(["kva", "kw", "phase", "frequency"]);
// CSV line 1 is the header; JSON rows are counted from 1.
const csvLine = (i: number) => i + 2;
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
) {
  return parseRows(file, csvRecords(await readText(dir, file), numeric), schema, csvLine);
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
function checkRevisions(equipment: EquipmentRow[], drawings: DrawingRev[]): void {
  const known = new Set(drawings.map((d) => `${d.drawing}@${d.revision}`));
  equipment.forEach((r, i) => {
    if (!known.has(`${r.drawing}@${r.revision}`)) {
      throw invalid(
        "equipment_schedule.csv",
        csvLine(i),
        `${r.tag}: ${r.drawing} rev ${r.revision} not in drawings.csv`,
      );
    }
  });
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
  checkRevisions(equipment, drawings);
  return indexProject(basename(dir), {
    equipment,
    drawings,
    poLines,
    submittals,
    activities,
    deliveries,
  });
}
