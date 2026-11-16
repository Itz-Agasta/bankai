/** RFC 4180 splitter: quoted fields, doubled quotes, CRLF. Returns rows of raw strings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Header-keyed records. Empty cells become null; listed columns become numbers when they parse. */
export function csvRecords(text: string, numeric: ReadonlySet<string>): Record<string, unknown>[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  return body.map((cells) =>
    Object.fromEntries(
      header.map((key, i) => {
        const raw = (cells[i] ?? "").trim();
        if (raw === "") return [key, null];
        const n = Number(raw);
        return [key, numeric.has(key) && Number.isFinite(n) ? n : raw];
      }),
    ),
  );
}
