// path: services/budget/report-tables.ts
// The budget, forecast and business intelligence reports as flat tables (columns, rows, totals, notes) that the platform's report
// file builder can export as CSV, Excel and PDF, and that the pages show as they are.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import type { ReportColumn, ReportResult } from '@/lib/reports/types';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { buildReportFile, type ExportFormat, type ReportFile } from '@/services/report/export';
import { monthEnd } from '@/services/asset/depreciation-rules';
import { businessOverview, type BusinessOverview } from './insights';
import { cashForecast, trendForecasts, type CashForecast, type TrendForecast } from './forecast';
import { budgetVariance, type VarianceResult } from './variance';

const col = (key: string, label: string, type: ReportColumn['type'] = 'text'): ReportColumn => ({
  key,
  label,
  type,
});

export function varianceTable(r: VarianceResult): ReportResult {
  const rows = r.report.rows.map((x) => ({
    account: `${x.code} ${x.name}`,
    type: x.type === 'revenue' ? 'Revenue' : 'Expense',
    budget: x.budget,
    actual: x.actual,
    variance: x.variance,
    used: x.usedPercent ?? '',
    flag: x.level === 100 ? 'Over budget' : x.level === 80 ? '80 percent used' : '',
  }));
  return {
    key: 'budget_variance',
    title: `Budget against actual: ${r.budget.name}`,
    period: { from: r.budget.fiscalYearStart, to: monthEnd(r.through) },
    columns: [
      col('account', 'Account'),
      col('type', 'Type'),
      col('budget', 'Budget', 'money'),
      col('actual', 'Actual', 'money'),
      col('variance', 'Variance', 'money'),
      col('used', 'Used', 'percent'),
      col('flag', 'Flag'),
    ],
    rows,
    totals: {
      account: 'Result (revenue less expenses)',
      budget: r.report.resultBudget,
      actual: r.report.resultActual,
      variance: Money.parse(r.report.resultActual).sub(r.report.resultBudget).toDbString(),
    },
    notes: [
      'Variance is positive when the result is better than the budget: less spent or more earned.',
      `At this pace revenue ends the year at ${r.revenueProjection.projectedYear} against a budget of ${r.revenueProjection.budgetYear}; expenses at ${r.expenseProjection.projectedYear} against ${r.expenseProjection.budgetYear}.`,
    ],
  };
}

export function cashTable(f: CashForecast): ReportResult {
  return {
    key: 'cash_forecast',
    title: 'Cash projection for 90 days',
    period: { from: f.asOf, to: f.projection.weeks[f.projection.weeks.length - 1]?.date ?? f.asOf },
    columns: [
      col('date', 'Week ending', 'date'),
      col('inflow', 'Money in', 'money'),
      col('outflow', 'Money out', 'money'),
      col('balance', 'Cash', 'money'),
    ],
    rows: f.projection.weeks.map((w) => ({
      date: w.date,
      inflow: w.inflow,
      outflow: w.outflow,
      balance: w.balance,
    })),
    totals: null,
    notes: [
      `Cash today ${f.openingCash}. In 30 days ${f.projection.horizons[0]?.endCash}, in 60 days ${f.projection.horizons[1]?.endCash}, in 90 days ${f.projection.horizons[2]?.endCash}.`,
      `Lowest point ${f.projection.lowest.balance} around ${f.projection.lowest.date}. ${f.runwayMonths === null ? 'The business is not burning cash.' : `Runway about ${f.runwayMonths} months at a burn of ${f.monthlyBurn} a month.`}`,
      ...f.notes,
    ],
  };
}

export function trendTable(t: TrendForecast): ReportResult {
  const past = t.history.map((h) => ({
    month: h.month,
    kind: 'Actual',
    revenue: h.revenue,
    expenses: h.expenses,
    result: Money.parse(h.revenue).sub(h.expenses).toDbString(),
  }));
  const next = t.forecast.map((h) => ({
    month: h.month,
    kind: 'Forecast',
    revenue: h.revenue,
    expenses: h.expenses,
    result: h.result,
  }));
  return {
    key: 'trend_forecast',
    title: 'Revenue and expense forecast',
    period: null,
    columns: [
      col('month', 'Month'),
      col('kind', 'Kind'),
      col('revenue', 'Revenue', 'money'),
      col('expenses', 'Expenses', 'money'),
      col('result', 'Result', 'money'),
    ],
    rows: [...past, ...next],
    totals: null,
    notes: [
      'The forecast is a straight line through the last months; it does not know about the pipeline or one-off costs.',
    ],
  };
}

export const BI_REPORT_KEYS = [
  'margins',
  'top_clients',
  'trends',
  'seasonality',
  'break_even',
  'working_capital',
  'health',
] as const;
export type BiReportKey = (typeof BI_REPORT_KEYS)[number];

const MONTH_NAMES = [
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

export function biTable(key: BiReportKey, o: BusinessOverview): ReportResult {
  const period = { from: o.from, to: o.to };
  const make = (
    title: string,
    columns: ReportColumn[],
    rows: Record<string, string>[],
    notes: string[] = [],
  ): ReportResult => ({
    key: `bi_${key}`,
    title,
    period,
    columns,
    rows,
    totals: null,
    notes,
  });
  const dash = (v: string | null): string => v ?? '-';
  switch (key) {
    case 'margins':
      return make(
        'Profit margins',
        [
          col('measure', 'Measure'),
          col('amount', 'Amount', 'money'),
          col('percent', 'Margin', 'percent'),
        ],
        [
          { measure: 'Revenue', amount: o.pl.revenue, percent: '' },
          {
            measure: 'Gross profit',
            amount: o.pl.grossProfit,
            percent: dash(o.pl.grossMarginPercent),
          },
          { measure: 'Operating income', amount: o.pl.operatingIncome, percent: '' },
          { measure: 'Net income', amount: o.pl.netIncome, percent: dash(o.pl.netMarginPercent) },
        ],
        [
          'Margins are for the whole business. Revenue by product or service is not tracked in the ledger.',
        ],
      );
    case 'top_clients':
      return make(
        'Top clients by revenue',
        [
          col('name', 'Client'),
          col('invoices', 'Invoices', 'number'),
          col('billed', 'Billed', 'money'),
          col('paid', 'Paid', 'money'),
          col('outstanding', 'Owed', 'money'),
          col('share', 'Share', 'percent'),
        ],
        o.topClients.map((c) => ({
          name: c.name,
          invoices: String(c.invoices),
          billed: c.billed,
          paid: c.paid,
          outstanding: c.outstanding,
          share: dash(c.sharePercent),
        })),
        [
          'Expenses are not tied to clients, so this shows revenue and collection, not profit per client.',
        ],
      );
    case 'trends': {
      const row = (label: string, t: BusinessOverview['revenueTrend']): Record<string, string> => ({
        measure: label,
        value: t?.value ?? '',
        mom: dash(t?.monthOverMonth ?? null),
        qoq: dash(t?.quarterOverQuarter ?? null),
        yoy: dash(t?.yearOverYear ?? null),
      });
      return make(
        'Trends',
        [
          col('measure', 'Measure'),
          col('value', 'Latest month', 'money'),
          col('mom', 'Against last month', 'percent'),
          col('qoq', 'Against last quarter', 'percent'),
          col('yoy', 'Against last year', 'percent'),
        ],
        [
          row('Revenue', o.revenueTrend),
          row('Expenses', o.expenseTrend),
          row('Net income', o.netTrend),
        ],
        ['A dash means there is no earlier period to compare with.'],
      );
    }
    case 'seasonality':
      return make(
        'Seasonal pattern of revenue',
        [
          col('month', 'Month'),
          col('average', 'Average revenue', 'money'),
          col('index', 'Index (100 is average)', 'number'),
        ],
        o.seasonality.map((s) => ({
          month: MONTH_NAMES[s.calendarMonth - 1] ?? '',
          average: s.average,
          index: dash(s.index),
        })),
        ['A pattern needs at least a year of history; months without data show a dash.'],
      );
    case 'break_even':
      return make(
        'Break-even',
        [col('measure', 'Measure'), col('value', 'Value', 'money')],
        [
          { measure: 'Revenue (12 months)', value: o.pl.revenue },
          { measure: 'Variable costs (cost of sales)', value: o.pl.costOfSales },
          {
            measure: 'Fixed costs (operating and other expenses)',
            value: Money.parse(o.pl.operatingExpenses).add(o.pl.otherExpenses).toDbString(),
          },
          {
            measure: 'Contribution margin percent',
            value: dash(o.breakEven.contributionMarginPercent),
          },
          { measure: 'Break-even revenue', value: dash(o.breakEven.breakEvenRevenue) },
          { measure: 'Margin of safety percent', value: dash(o.breakEven.marginOfSafetyPercent) },
        ],
        ['Cost of sales counts as variable and all other expenses as fixed.'],
      );
    case 'working_capital':
      return make(
        'Working capital and ratios',
        [col('measure', 'Measure'), col('value', 'Value', 'number')],
        [
          { measure: 'Working capital', value: o.ratios.workingCapital },
          { measure: 'Current ratio', value: dash(o.ratios.currentRatio) },
          { measure: 'Quick ratio', value: dash(o.ratios.quickRatio) },
          { measure: 'Debt to equity', value: dash(o.ratios.debtToEquity) },
          { measure: 'Return on equity percent', value: dash(o.ratios.returnOnEquityPercent) },
          { measure: 'Return on assets percent', value: dash(o.returnOnAssetsPercent) },
        ],
      );
    case 'health':
      return make(
        `Financial health score: ${o.health.score} of 100 (${o.health.band})`,
        [col('part', 'Part'), col('weight', 'Weight', 'percent'), col('score', 'Score', 'number')],
        o.health.parts.map((p) => ({
          part: p.key[0]?.toUpperCase() + p.key.slice(1),
          weight: String(p.weight),
          score: String(p.score),
        })),
        [
          'The score weighs liquidity, profit, debt, cash and collections. It is a guide, not advice.',
        ],
      );
  }
}

/** The budget, forecast or BI table by name (the exports and the pages use this one entry). */
export async function reportTable(
  actor: Actor,
  kind: 'variance' | 'cash' | 'trend' | 'bi',
  options: { budgetId?: string; through?: string; bi?: BiReportKey },
): Promise<ReportResult> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if (kind === 'variance') {
    if (!options.budgetId) throw new ValidationError('Choose a budget.');
    return varianceTable(await budgetVariance(companyId, options.budgetId, options.through));
  }
  if (kind === 'cash') return cashTable(await cashForecast(companyId));
  if (kind === 'trend') return trendTable(await trendForecasts(companyId));
  return biTable(options.bi ?? 'margins', await businessOverview(companyId));
}

export async function exportReportTable(
  actor: Actor,
  table: ReportResult,
  format: ExportFormat,
): Promise<ReportFile> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return buildReportFile(actor.companyId, table, format, actor.email || actor.userId);
}
