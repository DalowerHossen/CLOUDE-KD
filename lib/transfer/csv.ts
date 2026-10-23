// path: lib/transfer/csv.ts
// Reading and writing CSV. Reading follows RFC 4180 (quotes, doubled quotes, line breaks inside quotes) and accepts a
// byte order mark and the delimiters comma, semicolon, tab and pipe. Writing neutralises cells that a spreadsheet
// would run as a formula.

export const MAX_ROWS = 5000;
export const MAX_COLUMNS = 100;
export const MAX_CELL = 2000;

export class TransferError extends Error {}

const DELIMITERS = [',', ';', '\t', '|'] as const;

/** The delimiter that appears most often in the first line outside quotes. */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let best = ',';
  let max = 0;
  for (const [d, n] of counts)
    if (n > max) {
      best = d;
      max = n;
    }
  return best;
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let started = false;
  const endCell = (): void => {
    if (cell.length > MAX_CELL) throw new TransferError('A cell is longer than 2000 characters.');
    row.push(cell);
    cell = '';
    if (row.length > MAX_COLUMNS) throw new TransferError('The file has more than 100 columns.');
  };
  const endRow = (): void => {
    endCell();
    if (!(row.length === 1 && row[0] === '' && !started)) rows.push(row);
    row = [];
    started = false;
    if (rows.length > MAX_ROWS + 1) throw new TransferError('The file has more than 5000 rows.');
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') {
      quoted = true;
      started = true;
    } else if (ch === sep) {
      started = true;
      endCell();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text.charAt(i + 1) === '\n') i += 1;
      endRow();
    } else {
      started = true;
      cell += ch;
    }
  }
  if (quoted) throw new TransferError('A quoted cell is not closed.');
  if (cell !== '' || row.length > 0 || started) endRow();
  return rows;
}

/** Drops the watermark lines that exports add (cells starting with "# KD-EXPORT") and fully empty rows. */
export function cleanRows(rows: readonly string[][]): string[][] {
  return rows.filter(
    (r) => !(r[0] ?? '').startsWith('# KD-EXPORT') && r.some((c) => c.trim() !== ''),
  );
}

const FORMULA = /^(?:[=@\t\r]|[+-](?![0-9.]+$))/;

export function csvCell(value: string): string {
  const safe = FORMULA.test(value) ? `'${value}` : value;
  return /[",\r\n;|]/.test(safe) || safe !== safe.trim() ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return `${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
