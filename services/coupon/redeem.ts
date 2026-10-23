// path: services/coupon/redeem.ts
// Using a coupon at subscription checkout. The database function counts under a lock, so many companies at once can
// never pass the total limit, and a one-time coupon works once per company. Wrong codes are counted: after ten in an
// hour a company is asked to wait (a guard against guessing codes).
import 'server-only';
import { createHash } from 'node:crypto';
import { InternalError, RateLimitError, ValidationError } from '@/lib/errors';
import {
  COUPON_MESSAGES,
  MAX_FAILED_ATTEMPTS_PER_HOUR,
  couponProblem,
  discountFor,
  normalizeCode,
  type CouponError,
  type CouponKind,
} from '@/lib/payment/coupon-rules';
import { toInt } from '@/lib/reports/numbers';
import { type Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { COUPON_COLUMNS, type CouponRow } from './coupons';

export interface RedeemedCoupon {
  redemptionId: string;
  couponId: string;
  code: string;
  name: string;
  kind: CouponKind;
  percentOff: string | null;
  amountOff: string | null;
  trialDays: number | null;
  cycles: number;
}

const hashOf = (code: string): string =>
  createHash('sha256').update(normalizeCode(code)).digest('hex');

async function failedRecently(companyId: string): Promise<number> {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error } = await getAdminSupabase()
    .from('coupon_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gte('created_at', since);
  if (error) throw new InternalError(error);
  return count ?? 0;
}

async function recordFailure(companyId: string, code: string, reason: CouponError): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('coupon_attempts')
    .insert({ company_id: companyId, code_hash: hashOf(code), reason });
  if (error) throw new InternalError(error);
}

async function guard(companyId: string): Promise<void> {
  if ((await failedRecently(companyId)) >= MAX_FAILED_ATTEMPTS_PER_HOUR)
    throw new RateLimitError(3600, 'Too many wrong codes. Please wait an hour and try again.');
}

export interface Preview {
  ok: boolean;
  message: string;
  coupon: {
    code: string;
    name: string;
    kind: CouponKind;
    percentOff: string | null;
    amountOff: string | null;
    trialDays: number | null;
    cycles: number;
  } | null;
  discount: string | null;
}

/** Explains what a code would do for a plan and amount without using it. */
export async function previewCoupon(
  companyId: string,
  code: string,
  planSlug: string,
  amount: Money,
): Promise<Preview> {
  await guard(companyId);
  const { data, error } = await getAdminSupabase()
    .from('coupons')
    .select(COUPON_COLUMNS)
    .eq('code', normalizeCode(code))
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) {
    await recordFailure(companyId, code, 'invalid');
    return { ok: false, message: COUPON_MESSAGES.invalid, coupon: null, discount: null };
  }
  const c = data as unknown as CouponRow;
  const [total, mine] = await Promise.all([
    getAdminSupabase()
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', c.id)
      .is('deleted_at', null),
    getAdminSupabase()
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', c.id)
      .eq('company_id', companyId)
      .is('deleted_at', null),
  ]);
  if (total.error) throw new InternalError(total.error);
  if (mine.error) throw new InternalError(mine.error);
  const problem = couponProblem(
    {
      kind: c.kind,
      percentOff: c.percent_off === null ? null : String(c.percent_off),
      amountOff: c.amount_off === null ? null : String(c.amount_off),
      enabled: c.enabled,
      startsAt: c.starts_at,
      expiresAt: c.expires_at,
      planSlugs: c.plan_slugs,
      maxRedemptions: c.max_redemptions,
      oncePerCompany: c.once_per_company,
    },
    {
      now: new Date(),
      planSlug,
      redemptions: total.count ?? 0,
      usedByCompany: (mine.count ?? 0) > 0,
    },
  );
  if (problem) {
    await recordFailure(companyId, code, problem);
    return { ok: false, message: COUPON_MESSAGES[problem], coupon: null, discount: null };
  }
  const discount = discountFor(
    {
      kind: c.kind,
      percentOff: c.percent_off === null ? null : String(c.percent_off),
      amountOff: c.amount_off === null ? null : String(c.amount_off),
    },
    amount,
  );
  return {
    ok: true,
    message:
      c.kind === 'free_trial'
        ? `${c.trial_days} extra trial days.`
        : `${discount.toDbString()} USD off.`,
    coupon: {
      code: c.code,
      name: c.name,
      kind: c.kind,
      percentOff: c.percent_off === null ? null : String(c.percent_off),
      amountOff: c.amount_off === null ? null : String(c.amount_off),
      trialDays: c.trial_days,
      cycles: c.cycles,
    },
    discount: discount.toDbString(),
  };
}

/** Uses the coupon for the company. Refused with a plain message when it cannot be used. */
export async function redeemCoupon(
  companyId: string,
  code: string,
  planSlug: string,
): Promise<RedeemedCoupon> {
  await guard(companyId);
  const { data, error } = await getAdminSupabase().rpc('kd_coupon_redeem', {
    p_code: code,
    p_company: companyId,
    p_subscription: null,
    p_plan: planSlug,
  });
  if (error) throw new InternalError(error);
  const answer = data as {
    ok: boolean;
    error?: CouponError;
    redemption_id?: string;
    coupon_id?: string;
    code?: string;
    name?: string;
    kind?: CouponKind;
    percent_off?: string | number | null;
    amount_off?: string | number | null;
    trial_days?: number | null;
    cycles?: number;
  };
  if (!answer.ok) {
    const reason = answer.error ?? 'invalid';
    await recordFailure(companyId, code, reason);
    throw new ValidationError(COUPON_MESSAGES[reason]);
  }
  return {
    redemptionId: String(answer.redemption_id),
    couponId: String(answer.coupon_id),
    code: String(answer.code),
    name: String(answer.name),
    kind: answer.kind as CouponKind,
    percentOff:
      answer.percent_off === null || answer.percent_off === undefined
        ? null
        : String(answer.percent_off),
    amountOff:
      answer.amount_off === null || answer.amount_off === undefined
        ? null
        : String(answer.amount_off),
    trialDays: answer.trial_days ?? null,
    cycles: answer.cycles ?? 1,
  };
}

export async function linkRedemption(redemptionId: string, subscriptionId: string): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('coupon_redemptions')
    .update({ subscription_id: subscriptionId })
    .eq('id', redemptionId);
  if (error) throw new InternalError(error);
}

export interface InvoiceDiscount {
  redemptionId: string;
  label: string;
  amount: Money;
}

/**
 * The coupon discount for the next invoice of a subscription: the first redemption that still has invoices left (the
 * invoices already made with it are counted, so a retry never uses an invoice twice). Null when there is none.
 */
export async function discountForNextInvoice(
  subscriptionId: string,
  amount: Money,
): Promise<InvoiceDiscount | null> {
  const admin = getAdminSupabase();
  const reds = await admin
    .from('coupon_redemptions')
    .select('id, coupon_id, invoices_allowed')
    .eq('subscription_id', subscriptionId)
    .is('deleted_at', null)
    .order('created_at');
  if (reds.error) throw new InternalError(reds.error);
  for (const r of reds.data ?? []) {
    const used = await admin
      .from('platform_invoices')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_redemption_id', r.id)
      .neq('status', 'void')
      .is('deleted_at', null);
    if (used.error) throw new InternalError(used.error);
    if ((used.count ?? 0) >= toInt(r.invoices_allowed, 1)) continue;
    const c = await admin
      .from('coupons')
      .select(COUPON_COLUMNS)
      .eq('id', r.coupon_id)
      .maybeSingle();
    if (c.error) throw new InternalError(c.error);
    if (!c.data) continue;
    const row = c.data as unknown as CouponRow;
    const off = discountFor(
      {
        kind: row.kind,
        percentOff: row.percent_off === null ? null : String(row.percent_off),
        amountOff: row.amount_off === null ? null : String(row.amount_off),
      },
      amount,
    );
    if (!off.isPositive()) continue;
    return { redemptionId: String(r.id), label: `Coupon ${row.code}`, amount: off };
  }
  return null;
}
