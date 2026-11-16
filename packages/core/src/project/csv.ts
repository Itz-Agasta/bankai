export class CsvError extends Error {
  constructor(
    readonly line: number,
    readonly reason: string,
  ) {
    super(`line ${line}: ${reason}`);
  }
}

export interface CsvRow {
  /** File line the row starts on, 1-based. */
  line: number;
  cells: string[];
}

/** Strict RFC 4180: quotes only open a field, doubled quotes escape, CRLF or LF. */
export function parseCsvRows(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStart = true;
  let line = 1;
  let rowLine = 1;
  const endField = () => {
    row.push(field);
    field = "";
    fieldStart = true;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") line++;
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
        const next = text[i + 1];
        if (next !== undefined && next !== "," && next !== "\n" && next !== "\r") {
          throw new CsvError(line, "unexpected quote");
        }
      }
    } else if (c === '"') {
      if (!fieldStart) throw new CsvError(line, "unexpected quote");
      quoted = true;
      fieldStart = false;
    } else if (c === ",") endField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r") {
        if (text[i + 1] === "\n") i++;
        line++;
      }
      endField();
      rows.push({ line: rowLine, cells: row });
      row = [];
      rowLine = line;
    } else {
      field += c;
      fieldStart = false;
    }
  }
  if (quoted) throw new CsvError(rowLine, "unterminated quote");
  if (field !== "" || row.length > 0) {
    endField();
    rows.push({ line: rowLine, cells: row });
  }
  return rows.filter((r) => r.cells.some((f) => f.trim() !== ""));
}

export function parseCsv(text: string): string[][] {
  return parseCsvRows(text).map((r) => r.cells);
}

/** Header-keyed records. Empty cells become null; listed columns become numbers when they parse. */
export function csvRecords(
  text: string,
  numeric: ReadonlySet<string>,
): { line: number; record: Record<string, unknown> }[] {
  const [header, ...body] = parseCsvRows(text);
  if (!header) return [];
  return body.map(({ line, cells }) => {
    if (cells.length > header.cells.length) {
      throw new CsvError(line, `${cells.length} cells, header has ${header.cells.length}`);
    }
    const record = Object.fromEntries(
      header.cells.map((key, i) => {
        const raw = (cells[i] ?? "").trim();
        if (raw === "") return [key, null];
        const n = Number(raw);
        return [key, numeric.has(key) && Number.isFinite(n) ? n : raw];
      }),
    );
    return { line, record };
  });
}
