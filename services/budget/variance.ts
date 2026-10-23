// path: services/budget/variance.ts
// Budget against actual. The actual amounts come from the posted ledger, so the variance always matches the books. A report
// covers the months of the budget year up to the month asked for, with a projection of the year from the last three months.
// The daily job tells the owner when an expense account has used 80 percent and 100 percent of its budget so far this year.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { monthEnd } from '@/services/asset/depreciation-rules';
import { addMonthsToDay } from '@/services/accounting/period-rules';
import { balances, metas, monthly } from '@/services/accounting/reports';
import { natural } from '@/services/accounting/report-rules';
import { cellsOf, getBudget, budgetAccounts, type BudgetView } from './budgets';
import {
  monthsOf,
  overspendLevel,
  projectYear,
  variance,
  type BudgetAccount,
  type VarianceReport,
  type YearProjection,
} from './budget-rules';

const log = createLogger({ component: 'budget-variance' });

export interface VarianceResult {
  budget: BudgetView;
  through: string;
  report: VarianceReport;
  revenueProjection: YearProjection;
  expenseProjection: YearProjection;
}

/** Revenue and expense totals per account for a date range, in the natural direction of each account. */
async function actualsOf(companyId: string, from: string, to: string): Promise<Map<string, Money>> {
  const [accounts, bal] = await Promise.all([
    metas(companyId),
    balances(companyId, from, to, false),
  ]);
  const by = new Map(accounts.map((a) => [a.id, a]));
  const out = new Map<string, Money>();
  for (const b of bal) {
    const meta = by.get(b.accountId);
    if (meta && (meta.type === 'revenue' || meta.type === 'expense'))
      out.set(b.accountId, natural(meta, b));
  }
  return out;
}

/** The report for a budget through a month (first day, or any day of it); the default is the current month. */
export async function budgetVariance(
  companyId: string,
  budgetId: string,
  through?: string,
): Promise<VarianceResult> {
  const budget = await getBudget(companyId, budgetId);
  const months = monthsOf(budget.fiscalYearStart);
  const today = new Date().toISOString().slice(0, 10);
  const asked = (through ?? today).slice(0, 7);
  const last = months.filter((m) => m.slice(0, 7) <= asked);
  if (last.length === 0) throw new ValidationError('That month is before the budget year.');
  const toMonth = last[last.length - 1] as string;
  const accounts = await budgetAccounts(companyId);
  const cells = await cellsOf(companyId, budgetId);
  const budgetBy = new Map<string, Money>();
  const yearBy = new Map<string, Money>();
  for (const c of cells) {
    yearBy.set(c.accountId, (yearBy.get(c.accountId) ?? Money.zero()).add(c.amount));
    if (c.month <= toMonth)
      budgetBy.set(c.accountId, (budgetBy.get(c.accountId) ?? Money.zero()).add(c.amount));
  }
  const actual = await actualsOf(companyId, budget.fiscalYearStart, monthEnd(toMonth));
  const report = variance(accounts, budgetBy, actual);
  // Projection of the year: monthly totals of revenue and expenses from the ledger.
  const byMonth = await monthly(companyId, budget.fiscalYearStart, monthEnd(toMonth));
  const meta = new Map((await metas(companyId)).map((a) => [a.id, a]));
  const series = (type: 'revenue' | 'expense'): Money[] =>
    last.map((m) => {
      let total = Money.zero();
      for (const b of byMonth.get(m.slice(0, 7)) ?? []) {
        const a = meta.get(b.accountId);
        if (a && a.type === type) total = total.add(natural(a, b));
      }
      return total;
    });
  const yearOf = (type: 'revenue' | 'expense'): Money =>
    Money.sum(
      accounts
        .filter((a: BudgetAccount) => a.type === type)
        .map((a) => yearBy.get(a.id) ?? Money.zero()),
    );
  return {
    budget,
    through: toMonth,
    report,
    revenueProjection: projectYear(series('revenue'), yearOf('revenue')),
    expenseProjection: projectYear(series('expense'), yearOf('expense')),
  };
}

export async function varianceFor(
  actor: Actor,
  budgetId: string,
  through?: string,
): Promise<VarianceResult> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return budgetVariance(actor.companyId, budgetId, through);
}

/** Daily job: records and sends each overspend alert once (80 and 100 percent of the year to date). */
export async function runBudgetAlerts(
  today: string = new Date().toISOString().slice(0, 10),
): Promise<{ checked: number; alerts: number }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('budgets')
    .select('id, company_id, name')
    .in('status', ['approved', 'locked'])
    .lte('fiscal_year_start', today)
    .gt('fiscal_year_start', addMonthsToDay(today, -12))
    .is('deleted_at', null)
    .limit(5000);
  if (error) throw new InternalError(error);
  const out = { checked: 0, alerts: 0 };
  const month = `${today.slice(0, 7)}-01`;
  for (const b of data ?? []) {
    out.checked += 1;
    try {
      const r = await budgetVariance(String(b.company_id), String(b.id), today);
      for (const row of r.report.rows) {
        if (row.type !== 'expense') continue;
        const level = overspendLevel(Money.parse(row.budget), Money.parse(row.actual));
        if (level === 0) continue;
        for (const l of level === 100 ? [80, 100] : [80]) {
          const ins = await admin.from('budget_alerts').insert({
            company_id: b.company_id,
            budget_id: b.id,
            account_id: row.accountId,
            month,
            level: l,
            used_percent: row.usedPercent ?? '100',
          });
          if (ins.error) {
            if (ins.error.code === '23505') continue;
            throw new InternalError(ins.error);
          }
          out.alerts += 1;
          await getService('notification').notify({
            companyId: String(b.company_id),
            type: 'budget.overspend',
            title: l === 100 ? 'A budget is used up' : 'A budget is 80 percent used',
            body: `${row.name} has used ${row.usedPercent ?? '100'} percent of its budget this year (${row.actual} of ${row.budget} USD).`,
            href: `/accounting/budgets/${String(b.id)}`,
          });
        }
      }
    } catch (e) {
      if (e instanceof NotFoundError) continue;
      log.error('budget alert run failed', { budgetId: String(b.id), error: String(e) });
    }
  }
  return out;
}
