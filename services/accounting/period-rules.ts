// path: services/accounting/period-rules.ts
// The rules of fiscal periods as pure functions: which fiscal year a date falls in, the closing entry of a year (revenue and
// expense accounts to retained earnings), recurring entry dates, and the input shapes.
import { z } from 'zod';
import { Money } from '@/lib/utils/currency';
import { toInt } from '@/lib/reports/numbers';
import { dayText, journalLineInput, totals } from './journal-rules';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const settingsInput = z
  .object({
    fiscalStartMonth: z.number().int().min(1).max(12).optional(),
    closedPeriodPolicy: z.enum(['next_open', 'fail']).optional(),
    lockDate: dayText.nullable().optional(),
  })
  .strict();
export type SettingsInput = z.infer<typeof settingsInput>;

export const closeInput = z.object({ note: plain(0, 500).default('') }).strict();
export const reopenInput = z.object({ reason: plain(10, 300) }).strict();
export const moduleLockInput = z
  .object({ module: z.enum(['ar', 'ap']), locked: z.boolean() })
  .strict();

const pad = (n: number): string => String(n).padStart(2, '0');

/** The first day of the fiscal year that holds `date`, for a year that starts in `startMonth` (1 to 12). */
export function fiscalYearStart(date: string, startMonth: number): string {
  const year = toInt(date.slice(0, 4));
  const month = toInt(date.slice(5, 7));
  const startYear = month >= startMonth ? year : year - 1;
  return `${String(startYear).padStart(4, '0')}-${pad(startMonth)}-01`;
}

/** "FY2026" for a calendar year; "FY2026-27" for a year that starts in another month. */
export function fiscalYearLabel(start: string): string {
  const year = toInt(start.slice(0, 4));
  if (start.slice(5, 7) === '01') return `FY${year}`;
  return `FY${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}

export function addMonthsToDay(day: string, months: number): string {
  const moved = new Date(Date.UTC(toInt(day.slice(0, 4)), toInt(day.slice(5, 7)) - 1 + months, 1));
  return moved.toISOString().slice(0, 10);
}

export interface BalanceRow {
  accountId: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  debit: string;
  credit: string;
}

export interface ClosingResult {
  lines: { accountId: string; debit: string; credit: string; description: string }[];
  /** Positive for a profit, negative for a loss. */
  netIncome: Money;
}

/**
 * The closing entry of a year: each revenue and expense account with a balance is brought to zero and the difference goes to
 * retained earnings. Contra accounts close the same way because the sign of the balance decides the side.
 */
export function closingLines(
  rows: readonly BalanceRow[],
  retainedEarningsId: string,
): ClosingResult {
  const lines: ClosingResult['lines'] = [];
  let revenue = Money.zero();
  let expense = Money.zero();
  for (const r of rows) {
    if (r.type !== 'revenue' && r.type !== 'expense') continue;
    const debit = Money.parse(r.debit);
    const credit = Money.parse(r.credit);
    const natural = r.type === 'revenue' ? credit.sub(debit) : debit.sub(credit);
    if (natural.isZero()) continue;
    if (r.type === 'revenue') revenue = revenue.add(natural);
    else expense = expense.add(natural);
    // A revenue account with a credit balance is closed by a debit; an expense account with a debit balance by a credit.
    const closeWithDebit = r.type === 'revenue' ? natural.isPositive() : natural.isNegative();
    const amount = natural.abs().toDbString();
    lines.push({
      accountId: r.accountId,
      debit: closeWithDebit ? amount : '0',
      credit: closeWithDebit ? '0' : amount,
      description: 'Close to retained earnings',
    });
  }
  const net = revenue.sub(expense);
  if (!net.isZero()) {
    lines.push({
      accountId: retainedEarningsId,
      debit: net.isNegative() ? net.abs().toDbString() : '0',
      credit: net.isPositive() ? net.toDbString() : '0',
      description: 'Result of the year',
    });
  }
  return { lines, netIncome: net };
}

export const recurringInput = z
  .object({
    name: plain(1, 100),
    memo: plain(0, 500).default(''),
    frequency: z.enum(['monthly', 'quarterly', 'yearly']).default('monthly'),
    dayOfMonth: z.number().int().min(1).max(28).default(1),
    firstRun: dayText,
    endDate: dayText.nullable().default(null),
    autoPost: z.boolean().default(false),
    lines: z.array(journalLineInput).min(2).max(200),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!totals(v.lines).balanced)
      ctx.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'Debits and credits of a recurring entry must be equal.',
      });
  });
export type RecurringInput = z.infer<typeof recurringInput>;

const STEP_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 } as const;

/** The date of the run after `current`: the same day of the month, one period later. */
export function nextRun(
  current: string,
  frequency: keyof typeof STEP_MONTHS,
  dayOfMonth: number,
): string {
  return `${addMonthsToDay(current, STEP_MONTHS[frequency]).slice(0, 8)}${pad(dayOfMonth)}`;
}

/** The run dates from `next` up to `today` (at most `max`), so a job that missed days catches up one run at a time. */
export function dueDates(
  next: string,
  today: string,
  frequency: keyof typeof STEP_MONTHS,
  dayOfMonth: number,
  endDate: string | null,
  max = 12,
): string[] {
  const out: string[] = [];
  let cur = next;
  while (cur <= today && out.length < max && (endDate === null || cur <= endDate)) {
    out.push(cur);
    cur = nextRun(cur, frequency, dayOfMonth);
  }
  return out;
}

export interface CheckItem {
  key: string;
  label: string;
  done: boolean;
  /** How many things are left (for a count), or null for a yes or no item. */
  remaining: number | null;
}

/** Items that must be done before the books can be closed. */
export function canClose(items: readonly CheckItem[]): boolean {
  return items.every((i) => i.done);
}

/** The same calendar day one year earlier (29 February becomes 28 February). */
export function sameDayLastYear(day: string): string {
  const y = toInt(day.slice(0, 4)) - 1;
  const m = toInt(day.slice(5, 7));
  const d = toInt(day.slice(8, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(Math.min(d, last))}`;
}
