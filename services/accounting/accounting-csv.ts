// path: services/accounting/accounting-csv.ts
// Reading and writing the CSV files of the accounting imports and exports. Reading handles quoted cells, doubled quotes and
// line breaks inside quotes. Writing protects a cell that a spreadsheet could run as a formula.

export interface CsvTable {
  header: string[];
  rows: string[][];
}

/** Splits CSV text into cells. A byte order mark is removed; blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (src.charAt(i + 1) === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src.charAt(i + 1) === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export function csvTable(text: string): CsvTable {
  const all = parseCsv(text);
  const first = all[0];
  if (!first) return { header: [], rows: [] };
  return {
    header: first.map((h) => h.trim().toLowerCase().replace(/^\*/, '')),
    rows: all.slice(1),
  };
}

/** The position of the first header that matches one of the names, or -1. */
export function columnOf(header: readonly string[], names: readonly string[]): number {
  for (const name of names) {
    const at = header.indexOf(name);
    if (at >= 0) return at;
  }
  return -1;
}

/** One cell for output. A cell that starts with = + - @ or a tab is prefixed with an apostrophe. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
