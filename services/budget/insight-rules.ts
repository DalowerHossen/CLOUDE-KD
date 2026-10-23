// path: services/budget/insight-rules.ts
// Business intelligence as pure functions: change against the month before, the quarter before and the year before, seasonal
// pattern, break-even, return on assets, a financial health score from 0 to 100 and the rule-based insights and coach tips.
// No database here; every figure is a text amount or a text ratio.
import { Money } from '@/lib/utils/currency';

export interface MonthValue {
  month: string;
  value: string;
}

/** Percent change from `previous` to `current` with two decimals; null when there is nothing to compare with. */
export function percentChange(current: Money, previous: Money): string | null {
  if (previous.isZero()) return null;
  const { negative, integer, fraction } = current
    .sub(previous)
    .mul('100')
    .div(previous.abs().toDbString())
    .toParts(2);
  return `${negative ? '-' : ''}${integer}.${fraction}`;
}

export interface TrendChange {
  month: string;
  value: string;
  monthOverMonth: string | null;
  quarterOverQuarter: string | null;
  yearOverYear: string | null;
}

const add = (month: string, by: number): string =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1))
    .toISOString()
    .slice(0, 7);

/** The change of the latest month in a series against the month before, the quarter before and the same month a year ago. */
export function trendChange(series: readonly MonthValue[]): TrendChange | null {
  const sorted = [...series].sort((a, b) => a.month.localeCompare(b.month));
  const last = sorted[sorted.length - 1];
  if (!last) return null;
  const by = new Map(sorted.map((s) => [s.month, Money.parse(s.value)]));
  const get = (m: string): Money => by.get(m) ?? Money.zero();
  const quarter = (end: string): Money => Money.sum([0, -1, -2].map((i) => get(add(end, i))));
  const hasQuarterBefore = by.has(add(last.month, -5));
  return {
    month: last.month,
    value: last.value,
    monthOverMonth: by.has(add(last.month, -1))
      ? percentChange(get(last.month), get(add(last.month, -1)))
      : null,
    quarterOverQuarter: hasQuarterBefore
      ? percentChange(quarter(last.month), quarter(add(last.month, -3)))
      : null,
    yearOverYear: by.has(add(last.month, -12))
      ? percentChange(get(last.month), get(add(last.month, -12)))
      : null,
  };
}

export interface SeasonRow {
  /** 1 to 12. */
  calendarMonth: number;
  average: string;
  /** 100 is an average month; 130 means 30 percent above it. */
  index: string | null;
}

/** The pattern of the calendar months: each month's average against the average of all months (needs a year of data to be useful). */
export function seasonality(series: readonly MonthValue[]): SeasonRow[] {
  const groups = new Map<number, Money[]>();
  for (const s of series) {
    const k = Number(s.month.slice(5, 7));
    groups.set(k, [...(groups.get(k) ?? []), Money.parse(s.value)]);
  }
  const all = series.map((s) => Money.parse(s.value));
  const overall = all.length === 0 ? Money.zero() : Money.sum(all).div(String(all.length));
  return Array.from({ length: 12 }, (_, i): SeasonRow => {
    const list = groups.get(i + 1) ?? [];
    const avg = list.length === 0 ? Money.zero() : Money.sum(list).div(String(list.length));
    let index: string | null = null;
    if (list.length > 0 && !overall.isZero()) {
      index = avg.mul('100').div(overall.toDbString()).toParts(0).integer;
    }
    return { calendarMonth: i + 1, average: avg.toDbString(), index };
  });
}

export interface BreakEven {
  contributionMarginPercent: string | null;
  breakEvenRevenue: string | null;
  /** Revenue above break-even as a percent of revenue; negative when below it. */
  marginOfSafetyPercent: string | null;
}

/** Break-even revenue: fixed costs divided by the share of each sale left after variable costs. */
export function breakEven(revenue: Money, variableCosts: Money, fixedCosts: Money): BreakEven {
  if (!revenue.isPositive())
    return { contributionMarginPercent: null, breakEvenRevenue: null, marginOfSafetyPercent: null };
  const margin = revenue.sub(variableCosts);
  if (!margin.isPositive())
    return {
      contributionMarginPercent: percentChange(margin, Money.zero()) ?? '0.00',
      breakEvenRevenue: null,
      marginOfSafetyPercent: null,
    };
  const ratio = margin.div(revenue.toDbString());
  const be = fixedCosts.div(ratio.toDbString());
  return {
    contributionMarginPercent: shown(ratio.mul('100')),
    breakEvenRevenue: be.toDbString(),
    marginOfSafetyPercent: shown(revenue.sub(be).mul('100').div(revenue.toDbString())),
  };
}

function shown(value: Money): string {
  const { negative, integer, fraction } = value.toParts(2);
  return `${negative ? '-' : ''}${integer}.${fraction}`;
}

/** Return on assets: net income as a percent of total assets; null when there are no assets. */
export function returnOnAssets(netIncome: Money, totalAssets: Money): string | null {
  if (!totalAssets.isPositive()) return null;
  return shown(netIncome.mul('100').div(totalAssets.toDbString()));
}

export interface HealthInput {
  currentRatio: string | null;
  netMarginPercent: string | null;
  debtToEquity: string | null;
  runwayMonths: string | null;
  /** True when the business does not spend more than it earns. */
  cashPositive: boolean;
  overdueShare: string | null;
}

export interface HealthPart {
  key: 'liquidity' | 'profitability' | 'leverage' | 'cash' | 'collections';
  weight: number;
  score: number;
}

export interface Health {
  score: number;
  band: 'strong' | 'fair' | 'weak';
  parts: HealthPart[];
}

/** Linear score from 0 (at `bad`) to 100 (at `good`); the two ends can be in either order. */
function scale(value: Money, bad: string, good: string): number {
  const b = Money.parse(bad);
  const g = Money.parse(good);
  const span = g.sub(b);
  if (span.isZero()) return 0;
  const at = value.sub(b).div(span.toDbString());
  const clamped = Money.min(Money.max(at, Money.zero()), Money.parse('1'));
  return Number(clamped.mul('100').toParts(0).integer);
}

/** A score from 0 to 100 from liquidity, profit, debt, cash and collections (25, 25, 15, 20 and 15 percent). */
export function healthScore(i: HealthInput): Health {
  const part = (key: HealthPart['key'], weight: number, score: number): HealthPart => ({
    key,
    weight,
    score,
  });
  const parts: HealthPart[] = [
    part(
      'liquidity',
      25,
      i.currentRatio === null ? 50 : scale(Money.parse(i.currentRatio), '0.5', '2'),
    ),
    part(
      'profitability',
      25,
      i.netMarginPercent === null ? 50 : scale(Money.parse(i.netMarginPercent), '0', '15'),
    ),
    part(
      'leverage',
      15,
      i.debtToEquity === null ? 50 : scale(Money.parse(i.debtToEquity), '3', '0.5'),
    ),
    part(
      'cash',
      20,
      i.cashPositive
        ? 100
        : i.runwayMonths === null
          ? 50
          : scale(Money.parse(i.runwayMonths), '1', '12'),
    ),
    part(
      'collections',
      15,
      i.overdueShare === null ? 100 : scale(Money.parse(i.overdueShare), '50', '10'),
    ),
  ];
  const total = parts.reduce((s, p) => s + p.weight * p.score, 0);
  const score = Number(Money.parse(String(total)).div('100').toParts(0).integer);
  return { score, band: score >= 70 ? 'strong' : score >= 40 ? 'fair' : 'weak', parts };
}

export interface InsightFacts {
  overdueTop: { name: string; amount: string }[];
  overdueTotal: string;
  overBudget: { name: string; usedPercent: string }[];
  runwayMonths: string | null;
  cashPositive: boolean;
  netMarginPercent: string | null;
  netMarginChange: string | null;
  expenseChange: string | null;
  revenueChange: string | null;
  lowCashDate: string | null;
  topClientSharePercent: string | null;
}

/** Plain sentences from the facts of the books; each one says what is wrong and the amount. */
export function insights(f: InsightFacts): string[] {
  const out: string[] = [];
  if (f.overdueTop.length > 0 && Money.parse(f.overdueTotal).isPositive()) {
    const names = f.overdueTop.map((c) => `${c.name} (${c.amount})`).join(', ');
    out.push(
      `Your top ${f.overdueTop.length} overdue client${f.overdueTop.length === 1 ? '' : 's'} owe ${f.overdueTop.length === 1 ? '' : 'a total of '}${Money.sum(f.overdueTop.map((c) => Money.parse(c.amount))).toDbString()} USD: ${names}.`,
    );
  }
  for (const b of f.overBudget.slice(0, 3))
    out.push(`${b.name} has used ${b.usedPercent} percent of its budget.`);
  if (f.lowCashDate)
    out.push(`Cash is expected to drop below your warning level around ${f.lowCashDate}.`);
  if (!f.cashPositive && f.runwayMonths !== null)
    out.push(`At this pace your cash lasts about ${f.runwayMonths} months.`);
  if (f.expenseChange !== null && Money.parse(f.expenseChange).gt('20'))
    out.push(`Expenses grew ${f.expenseChange} percent against last month.`);
  if (f.revenueChange !== null && Money.parse(f.revenueChange).lt('-10'))
    out.push(
      `Revenue fell ${Money.parse(f.revenueChange).abs().toDbString()} percent against last month.`,
    );
  if (f.topClientSharePercent !== null && Money.parse(f.topClientSharePercent).gt('50'))
    out.push(`One client brings ${f.topClientSharePercent} percent of your revenue.`);
  return out;
}

/** Short advice that follows from the same facts; at most five, the most useful first. */
export function coachTips(f: InsightFacts): string[] {
  const tips: string[] = [];
  if (Money.parse(f.overdueTotal).isPositive())
    tips.push(
      'Send a reminder to the clients with overdue invoices; a call works better after the second reminder.',
    );
  if (f.overBudget.length > 0)
    tips.push(
      'Look at the accounts over budget and either cut the spending or raise the budget with a revision.',
    );
  if (
    f.lowCashDate ||
    (!f.cashPositive && f.runwayMonths !== null && Money.parse(f.runwayMonths).lt('6'))
  )
    tips.push(
      'Cash is tight: ask clients to pay sooner, delay costs that can wait, or arrange a credit line before you need it.',
    );
  if (f.netMarginPercent !== null && Money.parse(f.netMarginPercent).lt('5'))
    tips.push('Your net margin is thin. Check your prices and the biggest expense accounts.');
  if (f.topClientSharePercent !== null && Money.parse(f.topClientSharePercent).gt('50'))
    tips.push(
      'A large share of revenue comes from one client. Winning a second client lowers that risk.',
    );
  if (tips.length === 0)
    tips.push(
      'Your books look healthy. Keep reconciling the bank each month and review the budget variance.',
    );
  return tips.slice(0, 5);
}
