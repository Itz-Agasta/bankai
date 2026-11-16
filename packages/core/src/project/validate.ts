import type { z } from "zod";
import { BankaiFailure } from "../errors";

/**
 * Parse every row or throw PROJECT_INVALID naming the first bad one.
 * `rowNumber(i)` maps a 0-based record index to what a person sees in the file.
 */
export function parseRows<T>(
  file: string,
  rows: unknown[],
  schema: z.ZodType<T>,
  rowNumber: (i: number) => number,
): T[] {
  return rows.map((row, i) => {
    const r = schema.safeParse(row);
    if (!r.success) {
      const issue = r.error.issues[0];
      const where = issue?.path.join(".") || "row";
      throw invalid(file, rowNumber(i), `${where}: ${issue?.message ?? "invalid"}`);
    }
    return r.data;
  });
}

export function invalid(file: string, row: number, message: string): BankaiFailure {
  return new BankaiFailure(
    "PROJECT_INVALID",
    `Project data invalid in ${file}`,
    `${file}:${row}: ${message}`,
  );
}
