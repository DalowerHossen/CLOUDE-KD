// path: lib/project/time.ts
// Time tracking arithmetic: timer rounding, weeks, budgets. Pure; safe to import in the browser.
import { addDays } from '@/lib/invoice/terms';
import { roundMoney } from '@/lib/invoice/rounding';
import { Money } from '@/lib/utils/currency';

/** A timer that runs longer than this is cut at one day: nobody works 24 hours, the person must correct it. */
export const MAX_DAY_HOURS = '24.00';

/** Hours (two decimals) between two moments, rounded up to the step in minutes (0 = no rounding). At least 0.01. */
export function timerHours(startedAt: Date, stoppedAt: Date, roundMinutes: number): string {
  const ms = stoppedAt.getTime() - startedAt.getTime();
  let minutes = Math.ceil(ms / 60_000);
  if (minutes < 1) minutes = 1;
  if (roundMinutes > 0) minutes = Math.ceil(minutes / roundMinutes) * roundMinutes;
  const hours = roundMoney(Money.parse(String(minutes)).div('60'), 2, 'half_up');
  if (hours.gt(MAX_DAY_HOURS)) return MAX_DAY_HOURS;
  return hours.isZero() ? '0.01' : hours.toDbString().slice(0, -2);
}

/** Monday of the week that holds the day. */
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** The rate an entry gets: the person's rate on the project, else the project rate, else zero. */
export function entryRate(memberRate: string | null, projectRate: string | null): string {
  return Money.parse(memberRate ?? projectRate ?? '0').toDbString();
}

export type BudgetLevel = 'ok' | 'warn' | 'over';

export interface BudgetUse {
  /** Percent used (two decimals) or null when the budget is not set. */
  hoursPercent: string | null;
  amountPercent: string | null;
  level: BudgetLevel;
}

function percent(used: Money, budget: string | null): string | null {
  if (budget === null || !Money.parse(budget).isPositive()) return null;
  return roundMoney(used.mul('100').div(budget), 2, 'half_up').toDbString().slice(0, -2);
}

/** Budget use: warn from 80 percent, over from 100 percent, on whichever budget is set and is further along. */
export function budgetUse(
  budgetHours: string | null,
  budgetAmount: string | null,
  usedHours: string,
  usedAmount: string,
): BudgetUse {
  const hoursPercent = percent(Money.parse(usedHours), budgetHours);
  const amountPercent = percent(Money.parse(usedAmount), budgetAmount);
  const worst = [hoursPercent, amountPercent].reduce<Money>(
    (m, p) => (p !== null && Money.parse(p).gt(m) ? Money.parse(p) : m),
    Money.zero(),
  );
  return {
    hoursPercent,
    amountPercent,
    level: worst.gte('100') ? 'over' : worst.gte('80') ? 'warn' : 'ok',
  };
}

/** Amount of an entry: hours times the rate. */
export function entryAmount(hours: string, rate: string): Money {
  return Money.parse(rate).mul(hours);
}
