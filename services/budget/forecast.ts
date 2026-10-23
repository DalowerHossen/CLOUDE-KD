// path: services/budget/forecast.ts
// Forecasts from the books: the cash projection for 30, 60 and 90 days (cash on hand, open invoices, open supplier bills,
// recurring expenses and approved expenses not yet paid), the runway, revenue and expense forecasts from the trend of the last
// months, and the low cash warning the daily job sends to the owner at most once a week.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { addMonthsToDay, dueDates } from '@/services/accounting/period-rules';
import {
  apAgingReport,
  arAgingReport,
  balances,
  metas,
  monthly,
} from '@/services/accounting/reports';
import { monthlyTrend, monthsBetween, natural } from '@/services/accounting/report-rules';
import { monthEnd, monthStart } from '@/services/asset/depreciation-rules';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { settingsInput } from './budget-rules';
import {
  cashProjection,
  lowCash,
  monthlyBurn,
  runwayMonths,
  trendForecast,
  type CashProjection,
  type Flow,
} from './forecast-rules';

const log = createLogger({ component: 'forecast' });

export interface ForecastSettings {
  lowCashThreshold: string;
  lateDays: number;
  alertsEnabled: boolean;
  version: number | null;
}

const DEFAULTS: ForecastSettings = {
  lowCashThreshold: '0.0000',
  lateDays: 7,
  alertsEnabled: true,
  version: null,
};

export async function getForecastSettings(companyId: string): Promise<ForecastSettings> {
  const { data, error } = await getAdminSupabase()
    .from('forecast_settings')
    .select('low_cash_threshold, late_days, alerts_enabled, version')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return DEFAULTS;
  return {
    lowCashThreshold: Money.parseRounded(String(data.low_cash_threshold)).toDbString(),
    lateDays: Number(data.late_days),
    alertsEnabled: data.alerts_enabled === true,
    version: Number(data.version),
  };
}

export async function saveForecastSettings(
  actor: Actor,
  input: unknown,
): Promise<ForecastSettings> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The settings are not valid.');
  const d = parsed.data;
  const row = {
    low_cash_threshold: d.lowCashThreshold,
    late_days: d.lateDays,
    alerts_enabled: d.alertsEnabled,
  };
  const admin = getAdminSupabase();
  const current = await getForecastSettings(companyId);
  const write =
    current.version === null
      ? await admin.from('forecast_settings').insert({ company_id: companyId, ...row })
      : await admin
          .from('forecast_settings')
          .update(row)
          .eq('company_id', companyId)
          .eq('version', d.version ?? current.version)
          .is('deleted_at', null)
          .select('id');
  if (write.error) mapAccountingError(write.error);
  if (current.version !== null && ((write.data ?? []) as unknown[]).length === 0)
    throw new NotFoundError();
  await getService('audit').record({
    action: 'forecast.settings_saved',
    resourceType: 'forecast_settings',
    resourceId: null,
    companyId,
    metadata: row,
  });
  return getForecastSettings(companyId);
}

export interface CashForecast {
  asOf: string;
  openingCash: string;
  projection: CashProjection;
  monthlyBurn: string;
  runwayMonths: string | null;
  lowCash: boolean;
  threshold: string;
  notes: string[];
}

async function openExpenseFlows(companyId: string, today: string): Promise<Flow[]> {
  const admin = getAdminSupabase();
  const horizon = addMonthsToDay(monthStart(today), 4);
  const out: Flow[] = [];
  const unpaid = await admin
    .from('expenses')
    .select('expense_date, total, vendor')
    .eq('company_id', companyId)
    .eq('status', 'approved')
    .eq('payment_status', 'unpaid')
    .is('deleted_at', null)
    .limit(5000);
  if (unpaid.error) throw new InternalError(unpaid.error);
  for (const e of unpaid.data ?? [])
    out.push({
      date: String(e.expense_date),
      amount: Money.parseRounded(String(e.total)).toDbString(),
      label: String(e.vendor || 'Expense'),
    });
  const rec = await admin
    .from('recurring_expenses')
    .select('name, amount_net, tax_amount, frequency, day_of_month, next_run, end_date, paid')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(1000);
  if (rec.error) throw new InternalError(rec.error);
  for (const r of rec.data ?? []) {
    const frequency =
      r.frequency === 'yearly' ? 'yearly' : r.frequency === 'quarterly' ? 'quarterly' : 'monthly';
    for (const day of dueDates(
      String(r.next_run),
      horizon,
      frequency,
      Number(r.day_of_month),
      r.end_date ? String(r.end_date) : null,
      24,
    ))
      out.push({
        date: day,
        amount: Money.parseRounded(String(r.amount_net)).add(String(r.tax_amount)).toDbString(),
        label: String(r.name),
      });
  }
  return out;
}

export async function cashForecast(
  companyId: string,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<CashForecast> {
  const settings = await getForecastSettings(companyId);
  const [accounts, closing, ar, ap, expenseFlows] = await Promise.all([
    metas(companyId),
    balances(companyId, null, today, true),
    arAgingReport(companyId, today),
    apAgingReport(companyId, today),
    openExpenseFlows(companyId, today),
  ]);
  const by = new Map(accounts.map((a) => [a.id, a]));
  let cash = Money.zero();
  for (const b of closing) {
    const a = by.get(b.accountId);
    if (a?.isCash) cash = cash.add(natural(a, b));
  }
  const inflows: Flow[] = ar.rows.map((r) => ({
    date: r.dueDate,
    amount: r.amount,
    label: `${r.party} ${r.reference}`.trim(),
  }));
  const outflows: Flow[] = [
    ...ap.rows.map((r) => ({
      date: r.dueDate,
      amount: r.amount,
      label: `${r.party} ${r.reference}`.trim(),
    })),
    ...expenseFlows,
  ];
  const projection = cashProjection(cash.toDbString(), today, inflows, outflows, settings.lateDays);
  const from = addMonthsToDay(monthStart(today), -3);
  const byMonth = await monthly(companyId, from, monthEnd(addMonthsToDay(monthStart(today), -1)));
  const columns = monthlyTrend(
    accounts,
    monthsBetween(from.slice(0, 7), addMonthsToDay(monthStart(today), -1).slice(0, 7)),
    byMonth,
  );
  const burn = monthlyBurn(
    columns.map((c) => c.revenue),
    columns.map((c) => c.expenses),
  );
  return {
    asOf: today,
    openingCash: cash.toDbString(),
    projection,
    monthlyBurn: burn,
    runwayMonths: runwayMonths(cash.toDbString(), burn),
    lowCash: lowCash(projection.lowest.balance, settings.lowCashThreshold),
    threshold: settings.lowCashThreshold,
    notes: [
      `Open invoices are expected on their due date; late ones about ${settings.lateDays} days from today.`,
      'Open supplier bills, approved expenses not yet paid and recurring expenses are counted as money out. Payroll is not included.',
    ],
  };
}

export interface TrendForecast {
  history: { month: string; revenue: string; expenses: string }[];
  forecast: { month: string; revenue: string; expenses: string; result: string }[];
}

/** Revenue and expenses of the next three months from the straight line through the last six. */
export async function trendForecasts(
  companyId: string,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<TrendForecast> {
  const end = addMonthsToDay(monthStart(today), -1);
  const from = addMonthsToDay(monthStart(today), -6);
  const [accounts, byMonth] = await Promise.all([
    metas(companyId),
    monthly(companyId, from, monthEnd(end)),
  ]);
  const columns = monthlyTrend(accounts, monthsBetween(from.slice(0, 7), end.slice(0, 7)), byMonth);
  const revenue = trendForecast(
    columns.map((c) => c.revenue),
    3,
  );
  const expenses = trendForecast(
    columns.map((c) => c.expenses),
    3,
  );
  return {
    history: columns.map((c) => ({ month: c.month, revenue: c.revenue, expenses: c.expenses })),
    forecast: revenue.map((r, i) => ({
      month: addMonthsToDay(monthStart(today), i).slice(0, 7),
      revenue: r,
      expenses: expenses[i] ?? '0.0000',
      result: Money.parse(r)
        .sub(expenses[i] ?? '0')
        .toDbString(),
    })),
  };
}

/** Daily job: warns an owner whose cash is expected to fall below their level, at most once a week. */
export async function runForecastAlerts(
  today: string = new Date().toISOString().slice(0, 10),
): Promise<{ checked: number; warned: number }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('forecast_settings')
    .select('company_id, last_alert_at')
    .eq('alerts_enabled', true)
    .is('deleted_at', null)
    .limit(10_000);
  if (error) throw new InternalError(error);
  const out = { checked: 0, warned: 0 };
  const weekAgo = Date.now() - 7 * 86_400_000;
  for (const s of data ?? []) {
    out.checked += 1;
    if (s.last_alert_at && Date.parse(String(s.last_alert_at)) > weekAgo) continue;
    try {
      const f = await cashForecast(String(s.company_id), today);
      if (!f.lowCash) continue;
      await getService('notification').notify({
        companyId: String(s.company_id),
        type: 'forecast.low_cash',
        title: 'Cash is expected to run low',
        body: `Cash is expected to fall to ${f.projection.lowest.balance} USD around ${f.projection.lowest.date}, below your level of ${f.threshold} USD.`,
        href: '/accounting/forecast',
      });
      const up = await admin
        .from('forecast_settings')
        .update({ last_alert_at: new Date().toISOString() })
        .eq('company_id', s.company_id)
        .is('deleted_at', null);
      if (up.error) throw new InternalError(up.error);
      out.warned += 1;
    } catch (e) {
      log.error('forecast alert failed', { companyId: String(s.company_id), error: String(e) });
    }
  }
  return out;
}
