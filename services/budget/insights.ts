// path: services/budget/insights.ts
// Business intelligence from the books: margins, the clients that bring the most revenue and the ones that owe the most, trends
// against last month, last quarter and last year, the seasonal pattern, break-even, working capital, the financial health score,
// and the rule-based insights and coach tips. Everything is read from the posted ledger and the invoices of the company.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import { addMonthsToDay } from '@/services/accounting/period-rules';
import { arAgingReport, balances, metas, monthly } from '@/services/accounting/reports';
import {
  balanceSheet,
  monthlyTrend,
  monthsBetween,
  profitAndLoss,
  ratios,
  type ProfitLoss,
  type Ratios,
} from '@/services/accounting/report-rules';
import { monthEnd, monthStart } from '@/services/asset/depreciation-rules';
import { liveBudgetFor } from './budgets';
import { cashForecast } from './forecast';
import {
  breakEven,
  coachTips,
  healthScore,
  insights,
  returnOnAssets,
  seasonality,
  trendChange,
  type BreakEven,
  type Health,
  type SeasonRow,
  type TrendChange,
} from './insight-rules';
import { budgetVariance } from './variance';

export interface ClientRevenue {
  name: string;
  invoices: number;
  billed: string;
  paid: string;
  outstanding: string;
  sharePercent: string | null;
}

const INVOICED = ['sent', 'viewed', 'partially_paid', 'paid', 'overdue'];

/** Revenue by client over a date range from the invoices (billed, paid and still owed), biggest first. */
export async function clientRevenue(
  companyId: string,
  from: string,
  to: string,
): Promise<ClientRevenue[]> {
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .select('client_id, bill_to, total, amount_due')
    .eq('company_id', companyId)
    .eq('kind', 'invoice')
    .in('status', INVOICED)
    .gte('issue_date', from)
    .lte('issue_date', to)
    .is('deleted_at', null)
    .limit(20_000);
  if (error) throw new InternalError(error);
  const groups = new Map<string, { name: string; n: number; billed: Money; due: Money }>();
  for (const r of data ?? []) {
    const name = String((r.bill_to as { name?: string } | null)?.name ?? '') || 'Walk-in';
    const key = r.client_id ? String(r.client_id) : `name:${name}`;
    const g = groups.get(key) ?? { name, n: 0, billed: Money.zero(), due: Money.zero() };
    groups.set(key, {
      name,
      n: g.n + 1,
      billed: g.billed.add(Money.parseRounded(String(r.total))),
      due: g.due.add(Money.parseRounded(String(r.amount_due ?? '0'))),
    });
  }
  const total = Money.sum([...groups.values()].map((g) => g.billed));
  return [...groups.values()]
    .sort((a, b) =>
      b.billed.gt(a.billed) ? 1 : b.billed.lt(a.billed) ? -1 : a.name.localeCompare(b.name),
    )
    .map((g) => ({
      name: g.name,
      invoices: g.n,
      billed: g.billed.toDbString(),
      paid: g.billed.sub(g.due).toDbString(),
      outstanding: g.due.toDbString(),
      sharePercent: total.isZero()
        ? null
        : (({ integer, fraction }) => `${integer}.${fraction}`)(
            g.billed.mul('100').div(total.toDbString()).toParts(2),
          ),
    }));
}

export interface BusinessOverview {
  from: string;
  to: string;
  pl: ProfitLoss;
  ratios: Ratios;
  returnOnAssetsPercent: string | null;
  months: { month: string; revenue: string; expenses: string; netIncome: string }[];
  revenueTrend: TrendChange | null;
  expenseTrend: TrendChange | null;
  netTrend: TrendChange | null;
  seasonality: SeasonRow[];
  breakEven: BreakEven;
  topClients: ClientRevenue[];
  overdueClients: { name: string; amount: string }[];
  overdueTotal: string;
  health: Health;
  insights: string[];
  tips: string[];
  runwayMonths: string | null;
  monthlyBurn: string;
}

/** The whole picture for the last twelve months through `today`. */
export async function businessOverview(
  companyId: string,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<BusinessOverview> {
  const from = addMonthsToDay(monthStart(today), -11);
  const to = today;
  const [accounts, period, closing, byMonth, ar, clients, cash] = await Promise.all([
    metas(companyId),
    balances(companyId, from, to, false),
    balances(companyId, null, to, true),
    monthly(companyId, from, monthEnd(monthStart(today))),
    arAgingReport(companyId, today),
    clientRevenue(companyId, from, to),
    cashForecast(companyId, today),
  ]);
  const pl = profitAndLoss(accounts, period);
  const sheet = balanceSheet(accounts, closing);
  const r = ratios(accounts, sheet, pl, closing);
  const months = monthlyTrend(
    accounts,
    monthsBetween(from.slice(0, 7), today.slice(0, 7)),
    byMonth,
  );
  const series = (
    pick: (m: (typeof months)[number]) => string,
  ): { month: string; value: string }[] => months.map((m) => ({ month: m.month, value: pick(m) }));
  const revenueTrend = trendChange(series((m) => m.revenue));
  const expenseTrend = trendChange(series((m) => m.expenses));
  const netTrend = trendChange(series((m) => m.netIncome));
  const fixed = Money.parse(pl.operatingExpenses).add(pl.otherExpenses);
  const be = breakEven(Money.parse(pl.revenue), Money.parse(pl.costOfSales), fixed);
  const overdue = new Map<string, Money>();
  for (const row of ar.rows)
    if (row.daysOverdue > 0)
      overdue.set(
        row.party || 'Walk-in',
        (overdue.get(row.party || 'Walk-in') ?? Money.zero()).add(row.amount),
      );
  const overdueClients = [...overdue]
    .sort((a, b) => (b[1].gt(a[1]) ? 1 : b[1].lt(a[1]) ? -1 : a[0].localeCompare(b[0])))
    .slice(0, 3)
    .map(([name, amount]) => ({ name, amount: amount.toDbString() }));
  const overdueTotal = Money.sum([...overdue.values()]);
  const share = Money.parse(ar.total).isPositive()
    ? overdueTotal.mul('100').div(ar.total).toDbString()
    : null;
  const cashPositive = !Money.parse(cash.monthlyBurn).isPositive();
  const health = healthScore({
    currentRatio: r.currentRatio,
    netMarginPercent: r.netMarginPercent,
    debtToEquity: r.debtToEquity,
    runwayMonths: cash.runwayMonths,
    cashPositive,
    overdueShare: share,
  });
  const budget = await liveBudgetFor(companyId, today);
  const overBudget: { name: string; usedPercent: string }[] = [];
  if (budget) {
    const v = await budgetVariance(companyId, budget.id, today).catch(() => null);
    for (const row of v?.report.rows ?? [])
      if (row.type === 'expense' && row.level >= 80)
        overBudget.push({ name: row.name, usedPercent: row.usedPercent ?? '100.00' });
  }
  const facts = {
    overdueTop: overdueClients,
    overdueTotal: overdueTotal.toDbString(),
    overBudget,
    runwayMonths: cash.runwayMonths,
    cashPositive,
    netMarginPercent: r.netMarginPercent,
    netMarginChange: netTrend?.monthOverMonth ?? null,
    expenseChange: expenseTrend?.monthOverMonth ?? null,
    revenueChange: revenueTrend?.monthOverMonth ?? null,
    lowCashDate: cash.lowCash ? cash.projection.lowest.date : null,
    topClientSharePercent: clients[0]?.sharePercent ?? null,
  };
  return {
    from,
    to,
    pl,
    ratios: r,
    returnOnAssetsPercent: returnOnAssets(
      Money.parse(pl.netIncome),
      Money.parse(sheet.totalAssets),
    ),
    months,
    revenueTrend,
    expenseTrend,
    netTrend,
    seasonality: seasonality(series((m) => m.revenue)),
    breakEven: be,
    topClients: clients.slice(0, 10),
    overdueClients,
    overdueTotal: overdueTotal.toDbString(),
    health,
    insights: insights(facts),
    tips: coachTips(facts),
    runwayMonths: cash.runwayMonths,
    monthlyBurn: cash.monthlyBurn,
  };
}
