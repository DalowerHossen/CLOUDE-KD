// path: services/subscription/client-store.ts
// Rows and small writes shared by the client subscription services: the subscription row and view, saving a change when
// nobody else changed it meanwhile, and the history.
import 'server-only';
import { ConflictError, InternalError, NotFoundError } from '@/lib/errors';
import { cycleAmount } from '@/lib/payment/client-subscription-rules';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';

export type ClientSubStatus = 'trialing' | 'active' | 'paused' | 'past_due' | 'cancelled' | 'ended';

export interface ClientSubRow {
  id: string;
  company_id: string;
  client_id: string;
  plan_id: string;
  status: ClientSubStatus;
  interval: 'month' | 'year';
  price: string | number;
  seat_price: string | number;
  included_seats: number;
  seats: number;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  next_billing_at: string | null;
  cancel_at_period_end: boolean;
  cancel_reason: string | null;
  paused_at: string | null;
  pause_resumes_at: string | null;
  pending_plan_id: string | null;
  pending_seats: number | null;
  failed_attempts: number;
  next_attempt_at: string | null;
  grace_ends_at: string | null;
  created_by: string | null;
  version: number;
}

export const CLIENT_SUB_COLUMNS =
  'id, company_id, client_id, plan_id, status, interval, price, seat_price, included_seats, seats, trial_ends_at, current_period_start, current_period_end, next_billing_at, cancel_at_period_end, cancel_reason, paused_at, pause_resumes_at, pending_plan_id, pending_seats, failed_attempts, next_attempt_at, grace_ends_at, created_by, version';

export interface ClientSubView {
  id: string;
  clientId: string;
  planId: string;
  status: ClientSubStatus;
  interval: 'month' | 'year';
  seats: number;
  cycleAmount: string;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingAt: string | null;
  cancelAtPeriodEnd: boolean;
  cancelReason: string | null;
  pausedAt: string | null;
  pauseResumesAt: string | null;
  pendingPlanId: string | null;
  failedAttempts: number;
  version: number;
}

const m = (v: string | number): string => Money.parseRounded(String(v)).toDbString();

export const toClientSubView = (r: ClientSubRow): ClientSubView => ({
  id: r.id,
  clientId: r.client_id,
  planId: r.plan_id,
  status: r.status,
  interval: r.interval,
  seats: r.seats,
  cycleAmount: cycleAmount({
    price: m(r.price),
    seatPrice: m(r.seat_price),
    includedSeats: r.included_seats,
    seats: r.seats,
  }).toDbString(),
  trialEndsAt: r.trial_ends_at,
  currentPeriodStart: r.current_period_start,
  currentPeriodEnd: r.current_period_end,
  nextBillingAt: r.next_billing_at,
  cancelAtPeriodEnd: r.cancel_at_period_end,
  cancelReason: r.cancel_reason,
  pausedAt: r.paused_at,
  pauseResumesAt: r.pause_resumes_at,
  pendingPlanId: r.pending_plan_id,
  failedAttempts: r.failed_attempts,
  version: r.version,
});

export const priced = (
  r: ClientSubRow,
): { price: string; seatPrice: string; includedSeats: number; seats: number } => ({
  price: m(r.price),
  seatPrice: m(r.seat_price),
  includedSeats: r.included_seats,
  seats: r.seats,
});

export async function loadClientSub(companyId: string, id: string): Promise<ClientSubRow> {
  const { data, error } = await getAdminSupabase()
    .from('client_subscriptions')
    .select(CLIENT_SUB_COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as ClientSubRow;
}

export async function patchClientSub(
  sub: ClientSubRow,
  patch: Record<string, unknown>,
): Promise<ClientSubRow> {
  const { data, error } = await getAdminSupabase()
    .from('client_subscriptions')
    .update(patch)
    .eq('id', sub.id)
    .eq('version', sub.version)
    .select(CLIENT_SUB_COLUMNS)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data)
    throw new ConflictError('The subscription was changed by someone else. Reload and try again.');
  return data as unknown as ClientSubRow;
}

export async function logClientSub(
  sub: Pick<ClientSubRow, 'id' | 'company_id'>,
  event: string,
  detail: Record<string, unknown>,
  actorId: string | null,
): Promise<void> {
  const { error } = await getAdminSupabase().from('client_subscription_events').insert({
    company_id: sub.company_id,
    subscription_id: sub.id,
    event,
    detail,
    actor_id: actorId,
  });
  if (error) throw new InternalError(error);
}

export async function listClientSubs(
  companyId: string,
  filter: { status?: ClientSubStatus; clientId?: string; limit?: number } = {},
): Promise<(ClientSubView & { clientName: string; planName: string })[]> {
  const admin = getAdminSupabase();
  let q = admin
    .from('client_subscriptions')
    .select(CLIENT_SUB_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(filter.limit ?? 100, 1), 300));
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.clientId) q = q.eq('client_id', filter.clientId);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const rows = (data ?? []) as unknown as ClientSubRow[];
  const clients = new Map<string, string>();
  const plans = new Map<string, string>();
  if (rows.length > 0) {
    const [c, p] = await Promise.all([
      admin
        .from('clients')
        .select('id, name')
        .in('id', [...new Set(rows.map((r) => r.client_id))]),
      admin
        .from('client_subscription_plans')
        .select('id, name')
        .in('id', [...new Set(rows.map((r) => r.plan_id))]),
    ]);
    if (c.error) throw new InternalError(c.error);
    if (p.error) throw new InternalError(p.error);
    for (const x of c.data ?? []) clients.set(String(x.id), String(x.name));
    for (const x of p.data ?? []) plans.set(String(x.id), String(x.name));
  }
  return rows.map((r) => ({
    ...toClientSubView(r),
    clientName: clients.get(r.client_id) ?? '',
    planName: plans.get(r.plan_id) ?? '',
  }));
}

export async function clientSubEvents(
  companyId: string,
  id: string,
  limit = 50,
): Promise<{ event: string; detail: Record<string, unknown>; at: string }[]> {
  const { data, error } = await getAdminSupabase()
    .from('client_subscription_events')
    .select('event, detail, created_at')
    .eq('company_id', companyId)
    .eq('subscription_id', id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new InternalError(error);
  return (data ?? []).map((e) => ({
    event: String(e.event),
    detail: e.detail as Record<string, unknown>,
    at: String(e.created_at),
  }));
}
