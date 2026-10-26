// path: services/platform/tenant-insight.ts
// What the platform team sees about one company: API and e-mail use, quota bars, health score and churn signals. Every
// figure is read on its own; one that cannot be read is null and the rest still show.
import 'server-only';
import { createLogger } from '@/lib/logger';
import { daysLate, insight, type Insight } from '@/lib/platform/tenant-insight';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { meters, type MeterView } from '@/services/entitlement/usage';

const log = createLogger({ component: 'tenant-insight' });

async function safe<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    log.warn('company figure could not be read', { figure: name, error });
    return null;
  }
}

const day = (d: Date): string => d.toISOString().slice(0, 10);
const ago = (days: number): Date => new Date(Date.now() - days * 86_400_000);

export interface ApiUsage {
  requests30d: number;
  errors30d: number;
  requestsToday: number;
  keys: number;
}
export interface EmailUsage {
  sentMonth: number;
  failedMonth: number;
  queued: number;
  bouncedMonth: number;
}
export interface TenantInsight {
  api: ApiUsage | null;
  email: EmailUsage | null;
  meters: MeterView[] | null;
  insight: Insight | null;
}

async function apiUsage(companyId: string): Promise<ApiUsage> {
  const admin = getAdminSupabase();
  const [usage, keys] = await Promise.all([
    admin
      .from('api_key_usage')
      .select('day, requests, errors')
      .eq('company_id', companyId)
      .gte('day', day(ago(30)))
      .is('deleted_at', null)
      .limit(5000),
    admin
      .from('api_keys')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('deleted_at', null),
  ]);
  if (usage.error) throw usage.error;
  if (keys.error) throw keys.error;
  const today = day(new Date());
  let requests = 0;
  let errors = 0;
  let todayCount = 0;
  for (const r of usage.data ?? []) {
    requests += Number(r.requests);
    errors += Number(r.errors);
    if (String(r.day) === today) todayCount += Number(r.requests);
  }
  return {
    requests30d: requests,
    errors30d: errors,
    requestsToday: todayCount,
    keys: keys.count ?? 0,
  };
}

async function emailUsage(companyId: string): Promise<EmailUsage> {
  const admin = getAdminSupabase();
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01T00:00:00.000Z`;
  const [sent, failed, queued, bounced] = await Promise.all([
    admin
      .from('email_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('status', 'sent')
      .gte('created_at', monthStart),
    admin
      .from('email_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('status', 'failed')
      .gte('created_at', monthStart),
    admin
      .from('email_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('status', ['queued', 'sending']),
    admin
      .from('email_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('delivery_status', 'bounced')
      .gte('created_at', monthStart),
  ]);
  for (const r of [sent, failed, queued, bounced]) if (r.error) throw r.error;
  return {
    sentMonth: sent.count ?? 0,
    failedMonth: failed.count ?? 0,
    queued: queued.count ?? 0,
    bouncedMonth: bounced.count ?? 0,
  };
}

async function healthOf(companyId: string, meterList: MeterView[] | null): Promise<Insight> {
  const admin = getAdminSupabase();
  const since90 = ago(90).toISOString();
  const [
    sub,
    overdue,
    payouts,
    chargebacks,
    lastInvoice,
    logins,
    loginsPrev,
    planInvoice,
    tickets,
  ] = await Promise.all([
    admin
      .from('platform_subscriptions')
      .select('status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'overdue')
      .is('deleted_at', null),
    admin
      .from('payouts')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'failed')
      .gte('created_at', since90)
      .is('deleted_at', null),
    admin
      .from('settlement_items')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gt('charged_back', 0)
      .gte('created_at', since90)
      .is('deleted_at', null),
    admin
      .from('invoices')
      .select('created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('auth_login_events')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('event_type', 'login_success')
      .gte('created_at', ago(30).toISOString()),
    admin
      .from('auth_login_events')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('event_type', 'login_success')
      .gte('created_at', ago(60).toISOString())
      .lt('created_at', ago(30).toISOString()),
    admin
      .from('platform_invoices')
      .select('due_at')
      .eq('company_id', companyId)
      .eq('status', 'open')
      .is('deleted_at', null)
      .order('due_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['open', 'pending'])
      .in('priority', ['high', 'urgent'])
      .is('deleted_at', null),
  ]);
  for (const r of [
    sub,
    overdue,
    payouts,
    chargebacks,
    lastInvoice,
    logins,
    loginsPrev,
    planInvoice,
    tickets,
  ])
    if (r.error) throw r.error;
  const status = String(sub.data?.status ?? 'free');
  // A quota bar without a limit says nothing about use, so it is left out.
  const percents = (meterList ?? []).filter((m) => m.state !== 'unlimited').map((m) => m.percent);
  return insight({
    status: (status === 'incomplete' ? 'free' : status) as 'active',
    openInvoicesOverdue: overdue.count ?? 0,
    failedPayouts90d: payouts.count ?? 0,
    chargebacks90d: chargebacks.count ?? 0,
    usagePercent: percents.length > 0 ? Math.max(...percents) : 100,
    daysSinceLastInvoice: lastInvoice.data
      ? Math.floor((Date.now() - Date.parse(String(lastInvoice.data.created_at))) / 86_400_000)
      : null,
    signIns30d: logins.count ?? 0,
    signInsPrev30d: loginsPrev.count ?? 0,
    planInvoiceDaysLate: daysLate(planInvoice.data ? String(planInvoice.data.due_at) : null),
    openUrgentTickets: tickets.count ?? 0,
  });
}

export async function tenantInsight(companyId: string): Promise<TenantInsight> {
  const meterList = await safe('quota bars', () => meters(companyId));
  const [api, email, healthResult] = await Promise.all([
    safe('api usage', () => apiUsage(companyId)),
    safe('e-mail usage', () => emailUsage(companyId)),
    safe('health', () => healthOf(companyId, meterList)),
  ]);
  return { api, email, meters: meterList, insight: healthResult };
}
