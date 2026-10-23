// path: services/payment/reports.ts
// Payment reports of a company and the platform's gateway health (STEP 10.11). Counts use BigInt and money uses
// the Money type; no JavaScript Number arithmetic is involved.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { percentText } from './report-math';

const count = (v: unknown): bigint => BigInt(String(v ?? '0').split('.')[0] ?? '0');
const money = (v: unknown): Money => Money.parseRounded(String(v ?? '0'));

export interface PaymentReport {
  from: string;
  to: string;
  capturedTotal: string;
  refundedTotal: string;
  netTotal: string;
  paymentCount: string;
  capturedCount: string;
  failedCount: string;
  reviewCount: string;
  successRate: string | null;
  byDay: { day: string; captured: string; count: string }[];
  byStatus: { status: string; count: string; amount: string }[];
}

export async function paymentReport(
  companyId: string,
  from: Date,
  to: Date,
): Promise<PaymentReport> {
  const { data, error } = await getAdminSupabase().rpc('kd_payment_report', {
    p_company: companyId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw new InternalError(error);
  const rows = (data ?? []) as Record<string, unknown>[];
  let captured = Money.zero();
  let refunded = Money.zero();
  let total = 0n;
  const status = new Map<string, { count: bigint; amount: Money }>();
  const day = new Map<string, { captured: Money; count: bigint }>();
  for (const r of rows) {
    const s = String(r.status);
    const n = count(r.payment_count);
    total += n;
    captured = captured.add(money(r.captured));
    refunded = refunded.add(money(r.refunded));
    const cur = status.get(s) ?? { count: 0n, amount: Money.zero() };
    status.set(s, { count: cur.count + n, amount: cur.amount.add(money(r.amount)) });
    const d = String(r.day);
    const dc = day.get(d) ?? { captured: Money.zero(), count: 0n };
    day.set(d, { captured: dc.captured.add(money(r.captured)), count: dc.count + n });
  }
  const done =
    (status.get('captured')?.count ?? 0n) +
    (status.get('partially_refunded')?.count ?? 0n) +
    (status.get('refunded')?.count ?? 0n);
  const failed = status.get('failed')?.count ?? 0n;
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    capturedTotal: captured.toDbString(),
    refundedTotal: refunded.toDbString(),
    netTotal: captured.sub(refunded).toDbString(),
    paymentCount: String(total),
    capturedCount: String(done),
    failedCount: String(failed),
    reviewCount: String(status.get('pending_review')?.count ?? 0n),
    successRate: percentText(done, done + failed),
    byDay: [...day.entries()].map(([d, v]) => ({
      day: d,
      captured: v.captured.toDbString(),
      count: String(v.count),
    })),
    byStatus: [...status.entries()].map(([s, v]) => ({
      status: s,
      count: String(v.count),
      amount: v.amount.toDbString(),
    })),
  };
}

export interface GatewayHealthRow {
  processorId: string;
  attempts: string;
  succeeded: string;
  declined: string;
  errors: string;
  successRate: string | null;
  declinesByCategory: { category: string; count: string }[];
}

export async function gatewayHealth(since: Date): Promise<GatewayHealthRow[]> {
  const { data, error } = await getAdminSupabase().rpc('kd_gateway_health', {
    p_since: since.toISOString(),
  });
  if (error) throw new InternalError(error);
  const byProcessor = new Map<
    string,
    { ok: bigint; declined: bigint; err: bigint; cats: Map<string, bigint> }
  >();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const id = String(r.processor_id);
    const cur = byProcessor.get(id) ?? { ok: 0n, declined: 0n, err: 0n, cats: new Map() };
    const n = count(r.attempt_count);
    const outcome = String(r.outcome);
    if (outcome === 'authorized' || outcome === 'captured') cur.ok += n;
    else if (outcome === 'declined') {
      cur.declined += n;
      const cat = r.decline_category ? String(r.decline_category) : 'other';
      cur.cats.set(cat, (cur.cats.get(cat) ?? 0n) + n);
    } else if (outcome === 'error') cur.err += n;
    byProcessor.set(id, cur);
  }
  return [...byProcessor.entries()].map(([id, v]) => ({
    processorId: id,
    attempts: String(v.ok + v.declined + v.err),
    succeeded: String(v.ok),
    declined: String(v.declined),
    errors: String(v.err),
    successRate: percentText(v.ok, v.ok + v.declined + v.err),
    declinesByCategory: [...v.cats.entries()].map(([category, n]) => ({
      category,
      count: String(n),
    })),
  }));
}

/** Counts the platform administrators need on the overview page. */
export async function attentionCounts(): Promise<{ inReview: string; deadLetters: string }> {
  const db = getAdminSupabase();
  const [review, dead] = await Promise.all([
    db
      // tenant-ok: platform overview for administrators, counts only
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review')
      .is('deleted_at', null),
    db
      .from('webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'dead_letter')
      .is('deleted_at', null),
  ]);
  if (review.error) throw new InternalError(review.error);
  if (dead.error) throw new InternalError(dead.error);
  return { inReview: String(review.count ?? 0), deadLetters: String(dead.count ?? 0) };
}

/** Gateway health of the last 24 hours (the clock is read here, not while a page renders). */
export async function gatewayHealthLastDay(): Promise<GatewayHealthRow[]> {
  return gatewayHealth(new Date(Date.now() - 86_400_000));
}

/** Payment report of the last `days` days. */
export async function paymentReportLastDays(
  companyId: string,
  days: number,
): Promise<PaymentReport> {
  const to = new Date();
  return paymentReport(companyId, new Date(to.getTime() - days * 86_400_000), to);
}
