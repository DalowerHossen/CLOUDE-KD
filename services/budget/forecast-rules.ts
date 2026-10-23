// path: services/budget/forecast-rules.ts
// Forecasts as pure functions: the cash projection for the next 30, 60 and 90 days from open invoices, open bills and recurring
// costs, the lowest cash point, the runway in months, a trend forecast of revenue or expenses by a least squares line and the low
// cash warning. No database here.
import { Money } from '@/lib/utils/currency';

export interface Flow {
  /** The due date; a date in the past means late. */
  date: string;
  amount: string;
  label: string;
}

export interface ProjectionWeek {
  /** The last day of the week of the projection. */
  date: string;
  inflow: string;
  outflow: string;
  balance: string;
}

export interface Horizon {
  days: 30 | 60 | 90;
  inflow: string;
  outflow: string;
  endCash: string;
}

export interface CashProjection {
  weeks: ProjectionWeek[];
  horizons: Horizon[];
  lowest: { date: string; balance: string };
}

const DAY = 86_400_000;
const dayAt = (base: string, offset: number): string =>
  new Date(Date.parse(`${base}T00:00:00Z`) + offset * DAY).toISOString().slice(0, 10);
const diffDays = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** Where a flow lands: on its date, or a late one a few days after today (people pay late); never in the past. */
export function expectedDay(date: string, today: string, lateDays: number): string {
  return date < today ? dayAt(today, lateDays) : date;
}

/** Cash for the next 90 days from the opening cash and what is expected in and out, by week, with the 30, 60 and 90 day totals. */
export function cashProjection(
  openingCash: string,
  today: string,
  inflows: readonly Flow[],
  outflows: readonly Flow[],
  lateDays: number,
): CashProjection {
  const weeks: ProjectionWeek[] = [];
  const offsetOf = (f: Flow): number => diffDays(today, expectedDay(f.date, today, lateDays));
  const sumIn = (from: number, to: number): Money =>
    Money.sum(
      inflows
        .filter((f) => offsetOf(f) > from && offsetOf(f) <= to)
        .map((f) => Money.parse(f.amount)),
    );
  const sumOut = (from: number, to: number): Money =>
    Money.sum(
      outflows
        .filter((f) => offsetOf(f) > from && offsetOf(f) <= to)
        .map((f) => Money.parse(f.amount)),
    );
  let balance = Money.parse(openingCash);
  let lowest = { date: today, balance: balance.toDbString() };
  // Flows that fall on day 0 (today) count in the first week.
  for (let start = -1; start < 90; start += 7) {
    const end = Math.min(start + 7, 90);
    const i = sumIn(start, end);
    const o = sumOut(start, end);
    balance = balance.add(i).sub(o);
    const date = dayAt(today, end);
    weeks.push({
      date,
      inflow: i.toDbString(),
      outflow: o.toDbString(),
      balance: balance.toDbString(),
    });
    if (balance.lt(lowest.balance)) lowest = { date, balance: balance.toDbString() };
  }
  const horizons = ([30, 60, 90] as const).map((days): Horizon => {
    const i = sumIn(-1, days);
    const o = sumOut(-1, days);
    return {
      days,
      inflow: i.toDbString(),
      outflow: o.toDbString(),
      endCash: Money.parse(openingCash).add(i).sub(o).toDbString(),
    };
  });
  return { weeks, horizons, lowest };
}

/** Months of cash left at the current burn (money spent above money earned per month); null when the business is not burning cash. */
export function runwayMonths(cash: string, monthlyBurn: string): string | null {
  const burn = Money.parse(monthlyBurn);
  if (!burn.isPositive()) return null;
  const c = Money.parse(cash);
  if (!c.isPositive()) return '0.0';
  const { integer, fraction } = c.div(burn.toDbString()).toParts(1);
  return `${integer}.${fraction}`;
}

/** The monthly burn from the last months: spent minus earned, averaged; zero or negative when the business makes cash. */
export function monthlyBurn(revenue: readonly string[], expenses: readonly string[]): string {
  const n = Math.max(Math.min(revenue.length, expenses.length), 1);
  const net = Money.sum(expenses.map((v) => Money.parse(v))).sub(
    Money.sum(revenue.map((v) => Money.parse(v))),
  );
  return net.div(String(n)).toDbString();
}

/**
 * The next months from a straight line fitted to the past months (least squares); with fewer than three months the average is
 * used. The line never goes below zero.
 */
export function trendForecast(history: readonly string[], ahead: number): string[] {
  const n = history.length;
  if (n === 0) return Array.from({ length: ahead }, () => '0.0000');
  const values = history.map((v) => Money.parse(v));
  if (n < 3) {
    const avg = Money.sum(values).div(String(n));
    return Array.from({ length: ahead }, () => avg.toDbString());
  }
  const sx = (n * (n - 1)) / 2;
  const sxx = ((n - 1) * n * (2 * n - 1)) / 6;
  const sy = Money.sum(values);
  const sxy = Money.sum(values.map((v, i) => v.mul(String(i))));
  const denom = n * sxx - sx * sx;
  const slope = sxy
    .mul(String(n))
    .sub(sy.mul(String(sx)))
    .div(String(denom));
  const intercept = sy.sub(slope.mul(String(sx))).div(String(n));
  return Array.from({ length: ahead }, (_, k) =>
    Money.max(intercept.add(slope.mul(String(n + k))), Money.zero()).toDbString(),
  );
}

/** True when cash is expected to fall below the level the owner set (a level of zero means below zero). */
export function lowCash(lowest: string, threshold: string): boolean {
  return Money.parse(lowest).lt(threshold);
}
