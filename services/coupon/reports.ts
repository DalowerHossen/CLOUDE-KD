// path: services/coupon/reports.ts
// What coupons cost and bring: uses per coupon in a period, the discount given and the revenue of the invoices that used
// them (the revenue impact).
import 'server-only';
import { ForbiddenError, InternalError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface CouponReportRow {
  couponId: string;
  code: string;
  name: string;
  redemptions: number;
  invoices: number;
  discountGiven: string;
  revenue: string;
}

export interface CouponReport {
  from: string;
  to: string;
  rows: CouponReportRow[];
  totals: { redemptions: number; discountGiven: string; revenue: string };
}

/** Uses and impact of every coupon between two dates (UTC; `to` is not included). */
export async function couponReport(actor: Actor, from: string, to: string): Promise<CouponReport> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const admin = getAdminSupabase();
  const start = `${from}T00:00:00.000Z`;
  const end = `${to}T00:00:00.000Z`;
  const reds = await admin
    .from('coupon_redemptions')
    .select('id, coupon_id')
    .gte('created_at', start)
    .lt('created_at', end)
    .is('deleted_at', null)
    .limit(50_000);
  if (reds.error) throw new InternalError(reds.error);
  const invs = await admin
    .from('platform_invoices')
    .select('coupon_redemption_id, discount_amount, total, status')
    .not('coupon_redemption_id', 'is', null)
    .gte('issued_at', start)
    .lt('issued_at', end)
    .neq('status', 'void')
    .is('deleted_at', null)
    .limit(50_000);
  if (invs.error) throw new InternalError(invs.error);
  const redToCoupon = new Map<string, string>();
  // Invoices in the period may belong to redemptions made earlier: look those up too.
  const missing = [...new Set((invs.data ?? []).map((i) => String(i.coupon_redemption_id)))];
  const known = await admin
    .from('coupon_redemptions')
    .select('id, coupon_id')
    .in('id', missing.length > 0 ? missing : ['00000000-0000-0000-0000-000000000000']);
  if (known.error) throw new InternalError(known.error);
  for (const r of [...(reds.data ?? []), ...(known.data ?? [])])
    redToCoupon.set(String(r.id), String(r.coupon_id));
  const ids = [...new Set(redToCoupon.values())];
  const cps = await admin
    .from('coupons')
    .select('id, code, name')
    .in('id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']);
  if (cps.error) throw new InternalError(cps.error);
  const rows: CouponReportRow[] = (cps.data ?? []).map((c) => {
    const mine = (invs.data ?? []).filter(
      (i) => redToCoupon.get(String(i.coupon_redemption_id)) === String(c.id),
    );
    return {
      couponId: String(c.id),
      code: String(c.code),
      name: String(c.name),
      redemptions: (reds.data ?? []).filter((r) => String(r.coupon_id) === String(c.id)).length,
      invoices: mine.length,
      discountGiven: Money.sum(
        mine.map((i) => Money.parseRounded(String(i.discount_amount))),
      ).toDbString(),
      revenue: Money.sum(
        mine.filter((i) => i.status === 'paid').map((i) => Money.parseRounded(String(i.total))),
      ).toDbString(),
    };
  });
  rows.sort((a, b) => b.redemptions - a.redemptions || a.code.localeCompare(b.code));
  return {
    from,
    to,
    rows,
    totals: {
      redemptions: rows.reduce((n, r) => n + r.redemptions, 0),
      discountGiven: Money.sum(rows.map((r) => Money.parse(r.discountGiven))).toDbString(),
      revenue: Money.sum(rows.map((r) => Money.parse(r.revenue))).toDbString(),
    },
  };
}
