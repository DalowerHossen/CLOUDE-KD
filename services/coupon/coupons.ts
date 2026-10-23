// path: services/coupon/coupons.ts
// Coupons for platform subscriptions: the platform team makes, changes, switches off and deletes them. The code, the kind
// and the value never change after a coupon exists (companies may already hold it); a coupon that was used is switched
// off instead of deleted.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import {
  couponInput,
  couponUpdateInput,
  generateCode,
  type CouponKind,
} from '@/lib/payment/coupon-rules';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface CouponView {
  id: string;
  code: string;
  name: string;
  kind: CouponKind;
  percentOff: string | null;
  amountOff: string | null;
  trialDays: number | null;
  cycles: number;
  planSlugs: string[];
  startsAt: string | null;
  expiresAt: string | null;
  maxRedemptions: number | null;
  oncePerCompany: boolean;
  enabled: boolean;
  redemptions: number;
  version: number;
}

export const COUPON_COLUMNS =
  'id, code, name, kind, percent_off, amount_off, trial_days, cycles, plan_slugs, starts_at, expires_at, max_redemptions, once_per_company, enabled, version';

export interface CouponRow {
  id: string;
  code: string;
  name: string;
  kind: CouponKind;
  percent_off: string | number | null;
  amount_off: string | number | null;
  trial_days: number | null;
  cycles: number;
  plan_slugs: string[];
  starts_at: string | null;
  expires_at: string | null;
  max_redemptions: number | null;
  once_per_company: boolean;
  enabled: boolean;
  version: number;
}

export const toCouponView = (r: CouponRow, redemptions = 0): CouponView => ({
  id: r.id,
  code: r.code,
  name: r.name,
  kind: r.kind,
  percentOff: r.percent_off === null ? null : String(r.percent_off),
  amountOff: r.amount_off === null ? null : Money.parseRounded(String(r.amount_off)).toDbString(),
  trialDays: r.trial_days,
  cycles: r.cycles,
  planSlugs: r.plan_slugs,
  startsAt: r.starts_at,
  expiresAt: r.expires_at,
  maxRedemptions: r.max_redemptions,
  oncePerCompany: r.once_per_company,
  enabled: r.enabled,
  redemptions,
  version: r.version,
});

function requireSuper(actor: Actor): void {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
}

async function counts(ids: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const { data, error } = await getAdminSupabase()
    .from('coupon_redemptions')
    .select('coupon_id')
    .in('coupon_id', [...ids])
    .is('deleted_at', null)
    .limit(100_000);
  if (error) throw new InternalError(error);
  for (const r of data ?? []) out.set(String(r.coupon_id), (out.get(String(r.coupon_id)) ?? 0) + 1);
  return out;
}

export async function listCoupons(actor: Actor): Promise<CouponView[]> {
  requireSuper(actor);
  const { data, error } = await getAdminSupabase()
    .from('coupons')
    .select(COUPON_COLUMNS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new InternalError(error);
  const rows = (data ?? []) as unknown as CouponRow[];
  const used = await counts(rows.map((r) => r.id));
  return rows.map((r) => toCouponView(r, used.get(r.id) ?? 0));
}

export async function createCoupon(actor: Actor, input: unknown): Promise<CouponView> {
  requireSuper(actor);
  const parsed = couponInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The coupon is not valid.');
  const d = parsed.data;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = d.code ?? generateCode();
    const { data, error } = await getAdminSupabase()
      .from('coupons')
      .insert({
        code,
        name: d.name,
        kind: d.kind,
        percent_off: d.percentOff ?? null,
        amount_off: d.amountOff ?? null,
        trial_days: d.trialDays ?? null,
        cycles: d.cycles,
        plan_slugs: d.planSlugs,
        starts_at: d.startsAt,
        expires_at: d.expiresAt,
        max_redemptions: d.maxRedemptions,
        once_per_company: d.oncePerCompany,
        enabled: d.enabled,
        created_by: actor.userId,
      })
      .select(COUPON_COLUMNS)
      .single();
    if (error) {
      if (error.code === '23505') {
        if (d.code) throw new ConflictError('A coupon with this code already exists.');
        continue; // a generated code was taken: try another
      }
      throw new InternalError(error);
    }
    await getService('audit').record({
      action: 'coupon.created',
      resourceType: 'coupon',
      resourceId: String(data.id),
      companyId: null,
      metadata: { code, kind: d.kind },
    });
    return toCouponView(data as unknown as CouponRow);
  }
  throw new ConflictError('A free code could not be made. Try again.');
}

export async function updateCoupon(
  actor: Actor,
  id: string,
  version: number,
  input: unknown,
): Promise<CouponView> {
  requireSuper(actor);
  const parsed = couponUpdateInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.planSlugs !== undefined) patch.plan_slugs = d.planSlugs;
  if (d.startsAt !== undefined) patch.starts_at = d.startsAt;
  if (d.expiresAt !== undefined) patch.expires_at = d.expiresAt;
  if (d.maxRedemptions !== undefined) patch.max_redemptions = d.maxRedemptions;
  if (d.enabled !== undefined) patch.enabled = d.enabled;
  const { data, error } = await getAdminSupabase()
    .from('coupons')
    .update(patch)
    .eq('id', id)
    .eq('version', version)
    .is('deleted_at', null)
    .select(COUPON_COLUMNS)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data)
    throw new ConflictError('The coupon was changed by someone else. Reload and try again.');
  await getService('audit').record({
    action: 'coupon.updated',
    resourceType: 'coupon',
    resourceId: id,
    companyId: null,
    metadata: { fields: Object.keys(d) },
  });
  const used = await counts([id]);
  return toCouponView(data as unknown as CouponRow, used.get(id) ?? 0);
}

export async function deleteCoupon(actor: Actor, id: string): Promise<void> {
  requireSuper(actor);
  const used = await counts([id]);
  if ((used.get(id) ?? 0) > 0)
    throw new ValidationError('This coupon was used. Switch it off instead of deleting it.');
  const { data, error } = await getAdminSupabase()
    .from('coupons')
    .update({ deleted_at: new Date().toISOString(), enabled: false })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  await getService('audit').record({
    action: 'coupon.deleted',
    resourceType: 'coupon',
    resourceId: id,
    companyId: null,
    metadata: {},
  });
}
