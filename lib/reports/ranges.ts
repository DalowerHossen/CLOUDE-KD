// path: lib/reports/ranges.ts
// Date ranges of the dashboard and the reports, and the period just before each (for "compared with" numbers).
// All days are UTC calendar days (YYYY-MM-DD). Pure; safe to import in the browser.
import { addDays, daysBetween } from '@/lib/invoice/terms';
import { roundMoney } from '@/lib/invoice/rounding';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';

export const RANGE_KEYS = [
  'month',
  'last_month',
  'quarter',
  'year',
  'last_30',
  'last_year',
] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export interface DateRange {
  from: string;
  to: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const lastDay = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const parts = (day: string): { y: number; m: number; d: number } => {
  const [y, m, d] = day.split('-');
  return { y: toInt(y), m: toInt(m), d: toInt(d) };
};

function monthRange(y: number, m: number, months: number): DateRange {
  const endIndex = y * 12 + (m - 1) + months - 1;
  const ey = (endIndex - (endIndex % 12)) / 12;
  const em = (endIndex % 12) + 1;
  return { from: `${y}-${pad(m)}-01`, to: `${ey}-${pad(em)}-${pad(lastDay(ey, em))}` };
}

/** The range for a key, as of `today`. "to" is never later than the end of the period (it can be in the future). */
export function rangeFor(key: RangeKey, today: string): DateRange {
  const { y, m } = parts(today);
  switch (key) {
    case 'month':
      return monthRange(y, m, 1);
    case 'last_month':
      return m === 1 ? monthRange(y - 1, 12, 1) : monthRange(y, m - 1, 1);
    case 'quarter': {
      const first = m - ((m - 1) % 3);
      return monthRange(y, first, 3);
    }
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'last_year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'last_30':
      return { from: addDays(today, -29), to: today };
  }
}

/** The period of the same length that ends the day before this one starts (months and years keep calendar sense). */
export function previousRange(key: RangeKey, current: DateRange): DateRange {
  const { y, m } = parts(current.from);
  switch (key) {
    case 'month':
    case 'last_month':
      return m === 1 ? monthRange(y - 1, 12, 1) : monthRange(y, m - 1, 1);
    case 'quarter':
      return m <= 3 ? monthRange(y - 1, 10, 3) : monthRange(y, m - 3, 3);
    case 'year':
    case 'last_year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'last_30': {
      const length = daysBetween(current.from, current.to) + 1;
      return { from: addDays(current.from, -length), to: addDays(current.from, -1) };
    }
  }
}

/** Percentage change from `previous` to `current` with two decimals, or null when there is nothing to compare with. */
export function changePercent(current: string, previous: string): string | null {
  const prev = Money.parse(previous);
  if (!prev.isPositive()) return null;
  const diff = roundMoney(
    Money.parse(current).sub(prev).mul('100').div(prev.toDbString()),
    2,
    'half_up',
  );
  return diff.toDbString().slice(0, -2);
}
