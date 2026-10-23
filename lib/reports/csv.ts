// path: lib/reports/csv.ts
// A report as CSV text: a byte order mark (so Excel reads UTF-8), the header, the rows, the totals row and a last line
// with the export id. Cells that a spreadsheet would run as a formula are neutralised by `toCsv`. Pure.
import { toCsv } from '@/lib/transfer/csv';
import type { ReportResult } from './types';

export function csvOf(result: ReportResult, lines: readonly string[]): string {
  const table: string[][] = [
    result.columns.map((c) => c.label),
    ...result.rows.map((r) => result.columns.map((c) => r[c.key] ?? '')),
  ];
  if (result.totals) table.push(result.columns.map((c) => result.totals?.[c.key] ?? ''));
  table.push([`# ${lines[2] ?? ''}`]);
  return `\uFEFF${toCsv(table)}`;
}
