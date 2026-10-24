// path: lib/schedule/recurrence.ts
// Dates of a recurring schedule. Every occurrence is worked out from the start date and its number (not from the
// previous date), so a schedule that starts on the 31st gives Jan 31, Feb 28, Mar 31 and never drifts to the 28th.
// Pure; safe to import in the browser.
import { floorDiv, toInt } from '@/lib/reports/numbers';

export const RECURRENCE_UNITS = ['day', 'week', 'month', 'year'] as const;
export type RecurrenceUnit = (typeof RECURRENCE_UNITS)[number];

export interface Recurrence {
  unit: RecurrenceUnit;
  /** Every N units (1 = every week, 3 = every three months). */
  every: number;
  /** For months and years: always the last day of the month. */
  monthEnd: boolean;
  startDate: string;
}

/** Ready-made choices of the form. */
export const RECURRENCE_PRESETS = [
  { key: 'weekly', unit: 'week', every: 1 },
  { key: 'biweekly', unit: 'week', every: 2 },
  { key: 'monthly', unit: 'month', every: 1 },
  { key: 'quarterly', unit: 'month', every: 3 },
  { key: 'semiannual', unit: 'month', every: 6 },
  { key: 'annual', unit: 'year', every: 1 },
] as const satisfies readonly { key: string; unit: RecurrenceUnit; every: number }[];

export const MAX_EVERY: Record<RecurrenceUnit, number> = { day: 365, week: 52, month: 24, year: 5 };

function parts(day: string): { y: number; m: number; d: number } {
  const [y, m, d] = day.split('-');
  return { y: toInt(y), m: toInt(m), d: toInt(d) };
}

const pad = (n: number): string => String(n).padStart(2, '0');
const format = (y: number, m: number, d: number): string =>
  `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The date of occurrence number `index` (0 is the start date). */
export function occurrenceDate(r: Recurrence, index: number): string {
  const { y, m, d } = parts(r.startDate);
  if (r.unit === 'day' || r.unit === 'week') {
    const offset = index * r.every * (r.unit === 'week' ? 7 : 1);
    return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
  }
  const months = y * 12 + (m - 1) + index * r.every * (r.unit === 'year' ? 12 : 1);
  const year = floorDiv(months, 12);
  const month = (months % 12) + 1;
  const last = daysInMonth(year, month);
  return format(year, month, r.monthEnd ? last : Math.min(d, last));
}

/** The next dates a schedule will run, starting at occurrence number `from`. */
export function previewDates(r: Recurrence, from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => occurrenceDate(r, from + i));
}

export interface EndRule {
  endDate: string | null;
  maxOccurrences: number | null;
}

/** True when occurrence number `index` is still allowed by the end date and the maximum count. */
export function withinEnd(r: Recurrence, end: EndRule, index: number): boolean {
  if (end.maxOccurrences !== null && index >= end.maxOccurrences) return false;
  return end.endDate === null || occurrenceDate(r, index) <= end.endDate;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Fills {month}, {year}, {date} and {number} in the text of a generated invoice (notes and line descriptions). */
export function fillPlaceholders(text: string, day: string, occurrence: number): string {
  const { y, m } = parts(day);
  return text
    .replaceAll('{month}', MONTHS[m - 1] ?? '')
    .replaceAll('{year}', String(y))
    .replaceAll('{date}', day)
    .replaceAll('{number}', String(occurrence));
}

/** The calendar day in a time zone, as YYYY-MM-DD. */
export function localDay(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
