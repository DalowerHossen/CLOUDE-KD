// path: services/subscription/analytics.ts
// The revenue reports of the platform team: recurring revenue (MRR, ARR, churn, lifetime value, cohorts, net revenue
// retention), revenue by plan and by country, wallet settlement split between merchant-of-record and direct payments,
// payouts, chargebacks and the health of each paying company.
import 'server-only';
import { InternalError } from '@/lib/errors';
import {
  cohorts,
  churnPercent,
  health,
  lifetimeValue,
  monthlyEquivalent,
  monthOf,
  netRevenueRetention,
  percentOf,
  type CohortRow,
  type Risk,
} from '@/lib/payment/analytics-rules';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import { extraSeatsOf, periodAmount } from '@/lib/payment/subscription-rules';
import { listPlans, type PlanView } from '@/services/plan/plans';

interface SubRow {
  id: string;
  company_id: string;
  plan_slug: string;
  interval: 'month' | 'year';
  status: string;
  seats: number;
  created_at: string;
  ended_at: string | null;
}

async function loadSubs(): Promise<SubRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('platform_subscriptions')
    .select('id, company_id, plan_slug, interval, status, seats, created_at, ended_at')
    .is('deleted_at', null)
    .limit(50_000);
  if (error) throw new InternalError(error);
  return (data ?? []) as unknown as SubRow[];
}

/** Monthly amount of one subscription: the plan price plus seats above the included seats, a yearly plan per month. */
function monthlyOf(sub: SubRow, plans: Map<string, PlanView>): Money {
  const plan = plans.get(sub.plan_slug);
  if (!plan) return Money.zero();
  const included = plan.entitlements['staff.seats'];
  const amount = periodAmount(
    plan,
    sub.interval,
    extraSeatsOf(sub.seats, typeof included === 'number' ? included : null),
  );
  return monthlyEquivalent(amount, sub.interval);
}

export interface RevenueReport {
  from: string;
  to: string;
  payingCompanies: number;
  mrr: string;
  arr: string;
  arpu: string;
  churnPercent: string | null;
  lifetimeValue: string | null;
  netRevenueRetention: string | null;
  mrrByPlan: { plan: string; companies: number; mrr: string }[];
  cohorts: CohortRow[];
  paidRevenue: string;
  revenueByPlan: { plan: string; revenue: string }[];
  revenueByCountry: { country: string; revenue: string }[];
}

const PAYING = ['active', 'past_due', 'grace'];

export async function revenueReport(from: string, to: string): Promise<RevenueReport> {
  const start = `${from}T00:00:00.000Z`;
  const end = `${to}T00:00:00.000Z`;
  const admin = getAdminSupabase();
  const [subs, planList, invoices] = await Promise.all([
    loadSubs(),
    listPlans({ includeArchived: true }),
    admin
      .from('platform_invoices')
      .select('subscription_id, buyer_country, total, tax_amount')
      .eq('status', 'paid')
      .is('deleted_at', null)
      .gte('paid_at', start)
      .lt('paid_at', end)
      .limit(50_000),
  ]);
  if (invoices.error) throw new InternalError(invoices.error);
  const plans = new Map(planList.map((p) => [p.slug, p]));
  const paying = subs.filter((s) => PAYING.includes(s.status));
  const mrr = Money.sum(paying.map((s) => monthlyOf(s, plans)));
  const arpu = paying.length > 0 ? mrr.div(String(paying.length)) : Money.zero();
  const activeAtStart = subs.filter(
    (s) => s.created_at < start && (s.ended_at === null || s.ended_at >= start),
  );
  const left = activeAtStart.filter((s) => s.ended_at !== null && s.ended_at < end).length;
  const churn = churnPercent(activeAtStart.length, left);
  const startMrr = Money.sum(activeAtStart.map((s) => monthlyOf(s, plans)));
  const stillPaying = activeAtStart.filter((s) => PAYING.includes(s.status));
  const nowMrr = Money.sum(stillPaying.map((s) => monthlyOf(s, plans)));
  const byPlan = new Map<string, { companies: number; mrr: Money }>();
  for (const s of paying) {
    const cur = byPlan.get(s.plan_slug) ?? { companies: 0, mrr: Money.zero() };
    byPlan.set(s.plan_slug, {
      companies: cur.companies + 1,
      mrr: cur.mrr.add(monthlyOf(s, plans)),
    });
  }
  const planOfSub = new Map(subs.map((s) => [s.id, s.plan_slug]));
  const revenueByPlan = new Map<string, Money>();
  const revenueByCountry = new Map<string, Money>();
  let paidRevenue = Money.zero();
  for (const inv of invoices.data ?? []) {
    // Revenue excludes the tax collected for the tax office.
    const net = Money.parse(String(inv.total)).sub(String(inv.tax_amount));
    paidRevenue = paidRevenue.add(net);
    const plan = planOfSub.get(String(inv.subscription_id)) ?? 'other';
    revenueByPlan.set(plan, (revenueByPlan.get(plan) ?? Money.zero()).add(net));
    const country = String(inv.buyer_country ?? 'unknown');
    revenueByCountry.set(country, (revenueByCountry.get(country) ?? Money.zero()).add(net));
  }
  const order = (m: Map<string, Money>): { key: string; value: string }[] =>
    [...m.entries()]
      .sort((a, b) => (b[1].gt(a[1]) ? 1 : b[1].lt(a[1]) ? -1 : 0))
      .map(([key, value]) => ({ key, value: value.toDbString() }));
  return {
    from,
    to,
    payingCompanies: paying.length,
    mrr: mrr.toDbString(),
    arr: mrr.mul('12').toDbString(),
    arpu: arpu.toDbString(),
    churnPercent: churn,
    lifetimeValue: lifetimeValue(arpu, churn)?.toDbString() ?? null,
    netRevenueRetention: netRevenueRetention(startMrr, nowMrr),
    mrrByPlan: [...byPlan.entries()].map(([plan, v]) => ({
      plan,
      companies: v.companies,
      mrr: v.mrr.toDbString(),
    })),
    cohorts: cohorts(
      subs.map((s) => ({ startedAt: s.created_at, endedAt: s.ended_at })),
      monthOf(new Date().toISOString()),
    ),
    paidRevenue: paidRevenue.toDbString(),
    revenueByPlan: order(revenueByPlan).map((r) => ({ plan: r.key, revenue: r.value })),
    revenueByCountry: order(revenueByCountry).map((r) => ({ country: r.key, revenue: r.value })),
  };
}

export interface MoneyFlowReport {
  from: string;
  to: string;
  mor: { payments: number; gross: string; fees: string };
  direct: { payments: number; gross: string; fees: string };
  chargedBack: string;
  payouts: { status: string; count: number; amount: string }[];
  payoutFees: string;
  payoutFailureRate: string | null;
}

/** Settlement split by mode, chargebacks, and payouts by state in a period. */
export async function moneyFlowReport(from: string, to: string): Promise<MoneyFlowReport> {
  const start = `${from}T00:00:00.000Z`;
  const end = `${to}T00:00:00.000Z`;
  const admin = getAdminSupabase();
  const [items, payouts] = await Promise.all([
    admin
      .from('settlement_items')
      .select('mode, gross, fee, charged_back')
      .is('deleted_at', null)
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(100_000),
    admin
      .from('payouts')
      .select('status, amount, fee')
      .is('deleted_at', null)
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(100_000),
  ]);
  if (items.error) throw new InternalError(items.error);
  if (payouts.error) throw new InternalError(payouts.error);
  const bucket = (mode: string): { payments: number; gross: string; fees: string } => {
    const rows = (items.data ?? []).filter((r) => r.mode === mode);
    return {
      payments: rows.length,
      gross: Money.sum(rows.map((r) => Money.parse(String(r.gross)))).toDbString(),
      fees: Money.sum(rows.map((r) => Money.parse(String(r.fee)))).toDbString(),
    };
  };
  const byStatus = new Map<string, { count: number; amount: Money }>();
  let fees = Money.zero();
  for (const p of payouts.data ?? []) {
    const cur = byStatus.get(String(p.status)) ?? { count: 0, amount: Money.zero() };
    byStatus.set(String(p.status), {
      count: cur.count + 1,
      amount: cur.amount.add(String(p.amount)),
    });
    if (p.status === 'paid') fees = fees.add(String(p.fee));
  }
  const failed = byStatus.get('failed')?.count ?? 0;
  const finished = failed + (byStatus.get('paid')?.count ?? 0);
  return {
    from,
    to,
    mor: bucket('mor'),
    direct: bucket('direct'),
    chargedBack: Money.sum(
      (items.data ?? []).map((r) => Money.parse(String(r.charged_back))),
    ).toDbString(),
    payouts: [...byStatus.entries()].map(([status, v]) => ({
      status,
      count: v.count,
      amount: v.amount.toDbString(),
    })),
    payoutFees: fees.toDbString(),
    payoutFailureRate: finished > 0 ? percentOf(failed, finished) : null,
  };
}

export interface TenantHealth {
  companyId: string;
  name: string;
  plan: string;
  score: number;
  risk: Risk;
  reasons: string[];
}

/** Health of every company on a paid plan, worst first. */
export async function tenantHealth(limit = 100): Promise<TenantHealth[]> {
  const admin = getAdminSupabase();
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [subs, companies, payouts, items] = await Promise.all([
    loadSubs(),
    admin.from('companies').select('id, name, plan_key').is('deleted_at', null).limit(20_000),
    admin
      .from('payouts')
      .select('company_id, status')
      .eq('status', 'failed')
      .gte('created_at', since)
      .is('deleted_at', null)
      .limit(50_000),
    admin
      .from('settlement_items')
      .select('company_id, charged_back')
      .gt('charged_back', 0)
      .gte('created_at', since)
      .is('deleted_at', null)
      .limit(50_000),
  ]);
  if (companies.error) throw new InternalError(companies.error);
  if (payouts.error) throw new InternalError(payouts.error);
  if (items.error) throw new InternalError(items.error);
  const count = (rows: { company_id: unknown }[] | null): Map<string, number> => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(String(r.company_id), (m.get(String(r.company_id)) ?? 0) + 1);
    return m;
  };
  const failed = count(payouts.data);
  const chargebacks = count(items.data);
  const subOf = new Map<string, SubRow>();
  for (const s of subs) {
    const prev = subOf.get(s.company_id);
    if (!prev || prev.created_at < s.created_at) subOf.set(s.company_id, s);
  }
  const out: TenantHealth[] = [];
  for (const c of companies.data ?? []) {
    const id = String(c.id);
    const sub = subOf.get(id);
    if (!sub) continue;
    const result = health({
      status: (sub.status === 'incomplete' ? 'free' : sub.status) as 'active',
      openInvoicesOverdue: 0,
      failedPayouts90d: failed.get(id) ?? 0,
      chargebacks90d: chargebacks.get(id) ?? 0,
      usagePercent: 100,
      daysSinceLastInvoice: null,
    });
    out.push({
      companyId: id,
      name: String(c.name ?? ''),
      plan: String(c.plan_key ?? sub.plan_slug),
      score: result.score,
      risk: result.risk,
      reasons: result.reasons,
    });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, toInt(limit));
}
