// path: services/budget/budget-rules.ts
// Budgets as pure functions: the input shapes, spreading a quarterly or yearly amount over the months, copying a budget from the
// year before with a change in percent, the variance of budget against actual for revenue and expense accounts, the overspend
// level (80 and 100 percent) and the projection of the year from the run rate of the last months. No database here.
import { z } from 'zod';
import { Money } from '@/lib/utils/currency';
import { dayText } from '@/services/accounting/journal-rules';
import { addMonthsToDay } from '@/services/accounting/period-rules';

export const PERIOD_KINDS = ['monthly', 'quarterly', 'yearly'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];
const PERIODS_IN_YEAR: Record<PeriodKind, number> = { monthly: 12, quarterly: 4, yearly: 1 };

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const amount = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 1000 or 1000.50.');
const firstOfMonth = dayText.refine((v) => v.endsWith('-01'), {
  message: 'Use the first day of a month.',
});

export const budgetInput = z
  .object({
    name: plain(1, 120),
    fiscalYearStart: firstOfMonth,
    periodKind: z.enum(PERIOD_KINDS).default('monthly'),
    note: plain(0, 500).default(''),
  })
  .strict();

export const budgetUpdate = z
  .object({
    version: z.number().int().min(1),
    name: plain(1, 120).optional(),
    periodKind: z.enum(PERIOD_KINDS).optional(),
    note: plain(0, 500).optional(),
  })
  .strict();

/** One account of a draft budget: 12 monthly, 4 quarterly or 1 yearly amount, as the budget's period kind says. */
export const lineInput = z
  .object({ accountId: z.string().uuid(), amounts: z.array(amount).min(1).max(12) })
  .strict();

export const copyInput = z
  .object({
    sourceBudgetId: z.string().uuid(),
    name: plain(1, 120),
    fiscalYearStart: firstOfMonth,
    /** Change applied to every amount, for example 5 for five percent more or -10 for ten percent less. */
    adjustPercent: z
      .string()
      .regex(/^-?\d{1,3}(\.\d{1,2})?$/, 'Enter a percent like 5 or -10.')
      .default('0'),
  })
  .strict();

export const decideInput = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: plain(0, 500).default(''),
  })
  .strict();

export const settingsInput = z
  .object({
    version: z.number().int().min(1).optional(),
    lowCashThreshold: amount,
    lateDays: z.number().int().min(0).max(120),
    alertsEnabled: z.boolean(),
  })
  .strict();

/** The twelve months (first days) of a budget year. */
export function monthsOf(fiscalYearStart: string): string[] {
  return Array.from({ length: 12 }, (_, i) => addMonthsToDay(fiscalYearStart, i));
}

/**
 * Twelve monthly amounts from what the person typed. A quarterly amount is split over three months and a yearly one over twelve;
 * the part that does not divide goes to the last month of the period, so the total is exact. Null when the count is wrong.
 */
export function spread(kind: PeriodKind, amounts: readonly string[]): Money[] | null {
  if (amounts.length !== PERIODS_IN_YEAR[kind]) return null;
  const per = 12 / amounts.length;
  const out: Money[] = [];
  for (const text of amounts) {
    const total = Money.parse(text);
    const share = total.div(String(per));
    let used = Money.zero();
    for (let i = 0; i < per; i += 1) {
      const part = i === per - 1 ? total.sub(used) : share;
      used = used.add(part);
      out.push(part);
    }
  }
  return out;
}

export interface BudgetCell {
  accountId: string;
  month: string;
  amount: string;
}

/** The cells of a budget moved by some months and changed by a percent (copy from last year). */
export function copyCells(
  cells: readonly BudgetCell[],
  shiftMonths: number,
  percent: string,
): BudgetCell[] {
  const factor = Money.parse('100').add(percent).div('100').toDbString();
  return cells.map((c) => ({
    accountId: c.accountId,
    month: addMonthsToDay(c.month, shiftMonths),
    amount: Money.max(Money.parse(c.amount).mul(factor), Money.zero()).toDbString(),
  }));
}

export interface BudgetAccount {
  id: string;
  code: string;
  name: string;
  type: 'revenue' | 'expense';
}

export interface VarianceRow {
  accountId: string;
  code: string;
  name: string;
  type: 'revenue' | 'expense';
  budget: string;
  actual: string;
  /** Positive is better than the budget: less spent, or more earned. */
  variance: string;
  usedPercent: string | null;
  level: 0 | 80 | 100;
}

export interface VarianceReport {
  rows: VarianceRow[];
  revenueBudget: string;
  revenueActual: string;
  expenseBudget: string;
  expenseActual: string;
  resultBudget: string;
  resultActual: string;
}

function percentOf(part: Money, whole: Money): string | null {
  if (whole.isZero()) return null;
  const { integer, fraction, negative } = part.mul('100').div(whole.toDbString()).toParts(2);
  return `${negative ? '-' : ''}${integer}.${fraction}`;
}

/** The overspend level of an expense: 100 at or above the budget (or any spend with no budget), 80 from 80 percent. */
export function overspendLevel(budget: Money, actual: Money): 0 | 80 | 100 {
  if (!actual.isPositive()) return 0;
  if (budget.isZero()) return 100;
  if (actual.gte(budget)) return 100;
  if (actual.mul('100').gte(budget.mul('80'))) return 80;
  return 0;
}

/** Budget against actual per account over the months asked for (both amounts are for the same months). */
export function variance(
  accounts: readonly BudgetAccount[],
  budget: ReadonlyMap<string, Money>,
  actual: ReadonlyMap<string, Money>,
): VarianceReport {
  const rows: VarianceRow[] = [];
  const sums = {
    revenue: { budget: Money.zero(), actual: Money.zero() },
    expense: { budget: Money.zero(), actual: Money.zero() },
  };
  for (const a of [...accounts].sort((x, y) => x.code.localeCompare(y.code))) {
    const b = budget.get(a.id) ?? Money.zero();
    const act = actual.get(a.id) ?? Money.zero();
    if (b.isZero() && act.isZero()) continue;
    sums[a.type].budget = sums[a.type].budget.add(b);
    sums[a.type].actual = sums[a.type].actual.add(act);
    rows.push({
      accountId: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      budget: b.toDbString(),
      actual: act.toDbString(),
      variance: (a.type === 'expense' ? b.sub(act) : act.sub(b)).toDbString(),
      usedPercent: percentOf(act, b),
      level: a.type === 'expense' ? overspendLevel(b, act) : 0,
    });
  }
  return {
    rows,
    revenueBudget: sums.revenue.budget.toDbString(),
    revenueActual: sums.revenue.actual.toDbString(),
    expenseBudget: sums.expense.budget.toDbString(),
    expenseActual: sums.expense.actual.toDbString(),
    resultBudget: sums.revenue.budget.sub(sums.expense.budget).toDbString(),
    resultActual: sums.revenue.actual.sub(sums.expense.actual).toDbString(),
  };
}

export interface YearProjection {
  actualToDate: string;
  projectedRemaining: string;
  projectedYear: string;
  budgetYear: string;
  /** Projected year less the budget; for an expense, above zero means over budget. */
  difference: string;
}

/**
 * The year as it is heading: what was done so far plus the average of the last three months for each month still to come.
 * `actuals` are the months done (oldest first); `budgetYear` is the budget for all twelve.
 */
export function projectYear(actuals: readonly Money[], budgetYear: Money): YearProjection {
  const done = Money.sum([...actuals]);
  const recent = actuals.slice(-3);
  const average = recent.length === 0 ? Money.zero() : Money.sum(recent).div(String(recent.length));
  const left = Math.max(12 - actuals.length, 0);
  const remaining = average.mul(String(left));
  const year = done.add(remaining);
  return {
    actualToDate: done.toDbString(),
    projectedRemaining: remaining.toDbString(),
    projectedYear: year.toDbString(),
    budgetYear: budgetYear.toDbString(),
    difference: year.sub(budgetYear).toDbString(),
  };
}
