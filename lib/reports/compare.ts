// path: lib/reports/compare.ts
// Comparing the totals of a report with the same report for the period before. Pure; safe to import in the browser.
import { changePercent } from './ranges';
import type { ReportResult } from './types';

export interface ComparisonRow {
  key: string;
  label: string;
  type: 'money' | 'number' | 'percent';
  current: string;
  previous: string;
  /** Percentage change, or null when the earlier value is zero. */
  change: string | null;
}

/** One row for each numeric column that has a total in both results. */
export function compareTotals(current: ReportResult, previous: ReportResult): ComparisonRow[] {
  const out: ComparisonRow[] = [];
  for (const c of current.columns) {
    if (c.type !== 'money' && c.type !== 'number' && c.type !== 'percent') continue;
    const a = current.totals?.[c.key];
    const b = previous.totals?.[c.key];
    if (a === undefined || b === undefined || a === '' || b === '') continue;
    out.push({
      key: c.key,
      label: c.label,
      type: c.type,
      current: a,
      previous: b,
      change: changePercent(a, b),
    });
  }
  return out;
}
