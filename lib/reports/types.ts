// path: lib/reports/types.ts
// The shape every report returns: columns, rows of text, an optional total row. Amounts and counts are text so no
// precision is lost on the way to the screen, a CSV, a spreadsheet or a PDF. Safe to import in the browser.
export type ColumnType = 'text' | 'money' | 'number' | 'date' | 'percent';

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export interface ReportResult {
  key: string;
  title: string;
  period: { from: string; to: string } | null;
  columns: ReportColumn[];
  rows: Record<string, string>[];
  /** Totals for the numeric columns (the first column carries the word "Total"), or null. */
  totals: Record<string, string> | null;
  notes: string[];
}

/** Most rows a report reads or returns. Bigger sets must be narrowed by date. */
export const MAX_REPORT_ROWS = 20_000;
