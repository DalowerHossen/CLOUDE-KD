// path: services/subscription/client-reports.ts
// The reports of a company's client subscriptions: monthly recurring revenue (a yearly plan counted per month), the
// number of subscribers, revenue per subscriber, churn in a period and lifetime value.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { churnPercent, lifetimeValue, mrrOf } from '@/lib/payment/client-subscription-rules';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { CLIENT_SUB_COLUMNS, priced, type ClientSubRow } from './client-store';

export interface ClientSubscriptionReport {
  from: string;
  to: string;
  subscribers: number;
  trialing: number;
  paused: number;
  pastDue: number;
  mrr: string;
  arr: string;
  arpu: string;
  startedInPeriod: number;
  leftInPeriod: number;
  churnPercent: string | null;
  lifetimeValue: string | null;
}

const RUNNING = ['trialing', 'active', 'past_due'];

/** MRR counts subscribers who pay (active or past due); trials and paused subscriptions are shown separately. */
export async function clientSubscriptionReport(
  companyId: string,
  from: string,
  to: string,
): Promise<ClientSubscriptionReport> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('client_subscriptions')
    .select(`${CLIENT_SUB_COLUMNS}, created_at, ended_at`)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .limit(20_000);
  if (error) throw new InternalError(error);
  const rows = (data ?? []) as unknown as (ClientSubRow & {
    created_at: string;
    ended_at: string | null;
  })[];
  const start = `${from}T00:00:00.000Z`;
  const end = `${to}T00:00:00.000Z`;
  const paying = rows.filter((r) => r.status === 'active' || r.status === 'past_due');
  const mrr = mrrOf(paying.map((r) => ({ ...priced(r), interval: r.interval })));
  const arpu = paying.length > 0 ? mrr.div(String(paying.length)) : Money.zero();
  const startedInPeriod = rows.filter((r) => r.created_at >= start && r.created_at < end).length;
  const leftInPeriod = rows.filter(
    (r) => r.ended_at !== null && r.ended_at >= start && r.ended_at < end,
  ).length;
  const activeAtStart = rows.filter(
    (r) => r.created_at < start && (r.ended_at === null || r.ended_at >= start),
  ).length;
  const churn = churnPercent(activeAtStart, leftInPeriod);
  return {
    from,
    to,
    subscribers: rows.filter((r) => RUNNING.includes(r.status)).length,
    trialing: rows.filter((r) => r.status === 'trialing').length,
    paused: rows.filter((r) => r.status === 'paused').length,
    pastDue: rows.filter((r) => r.status === 'past_due').length,
    mrr: mrr.toDbString(),
    arr: mrr.mul('12').toDbString(),
    arpu: arpu.toDbString(),
    startedInPeriod,
    leftInPeriod,
    churnPercent: churn,
    lifetimeValue: lifetimeValue(arpu, churn)?.toDbString() ?? null,
  };
}
