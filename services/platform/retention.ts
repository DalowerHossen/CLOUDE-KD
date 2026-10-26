// path: services/platform/retention.ts
// The exit survey and the retention offers. A company that cancels or goes to a lower plan is asked why; the platform team's
// offer for that reason is shown before it continues; the answer is kept with what the company did (stayed or continued).
// A failed survey write never stops a cancel or a plan change: it is logged.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  REASON_CODES,
  TRIGGERS,
  bestOffer,
  saveRate,
  type OfferAction,
  type OfferRow,
  type ReasonCode,
  type SavedInput,
  type SurveyAnswer,
  type Trigger,
} from '@/lib/platform/retention';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const log = createLogger({ component: 'retention' });
const COLUMNS = 'id, trigger_kind, reason_code, title, message, coupon_code, created_at, status';

const toOffer = (r: Record<string, unknown>): OfferRow => ({
  id: String(r.id),
  triggerKind: String(r.trigger_kind) as Trigger,
  reasonCode: r.reason_code ? (String(r.reason_code) as ReasonCode) : null,
  title: String(r.title),
  message: String(r.message),
  couponCode: r.coupon_code ? String(r.coupon_code) : null,
  createdAt: String(r.created_at),
});

/** The offer to show for this trigger and reason, or null. */
export async function offerFor(trigger: Trigger, reason: ReasonCode): Promise<OfferRow | null> {
  const { data, error } = await getAdminSupabase()
    .from('retention_offers')
    .select(COLUMNS)
    .eq('status', 'active')
    .eq('trigger_kind', trigger)
    .or(`reason_code.eq.${reason},reason_code.is.null`)
    .is('deleted_at', null)
    .limit(50);
  if (error) throw new InternalError(error);
  return bestOffer((data ?? []).map(toOffer), trigger, reason);
}

async function write(
  actor: Actor,
  row: {
    trigger: Trigger;
    reasonCode: ReasonCode;
    detail: string;
    planFrom: string | null;
    planTo: string | null;
    offerId: string | null;
    outcome: 'saved' | 'continued';
  },
): Promise<void> {
  if (!actor.companyId) throw new ForbiddenError();
  const { error } = await getAdminSupabase().from('exit_surveys').insert({
    company_id: actor.companyId,
    user_id: actor.userId,
    trigger_kind: row.trigger,
    reason_code: row.reasonCode,
    detail: row.detail,
    plan_from: row.planFrom,
    plan_to: row.planTo,
    offer_id: row.offerId,
    outcome: row.outcome,
  });
  if (error) throw new InternalError(error);
}

/** Called after a cancel or a downgrade went through: the company continued. Never throws. */
export async function recordContinued(
  actor: Actor,
  trigger: Trigger,
  answer: SurveyAnswer,
  planFrom: string | null,
  planTo: string | null,
): Promise<void> {
  try {
    await write(actor, {
      trigger,
      reasonCode: answer.reasonCode,
      detail: answer.detail,
      planFrom,
      planTo,
      offerId: answer.offerId,
      outcome: 'continued',
    });
  } catch (error) {
    log.error('exit survey could not be saved', { error });
  }
}

/** The company chose to stay after seeing the offer. */
export async function recordSaved(actor: Actor, input: SavedInput): Promise<void> {
  await write(actor, {
    trigger: input.trigger,
    reasonCode: input.reasonCode,
    detail: input.detail,
    planFrom: null,
    planTo: input.planTo,
    offerId: input.offerId,
    outcome: 'saved',
  });
  await getService('audit').record({
    action: 'subscription.retention_saved',
    resourceType: 'subscription',
    resourceId: null,
    companyId: actor.companyId,
    metadata: { trigger: input.trigger, reason: input.reasonCode, offer: input.offerId },
  });
}

// ---- platform side ----
export interface OfferView extends OfferRow {
  status: 'active' | 'disabled';
}

export async function listOffers(): Promise<OfferView[]> {
  const { data, error } = await getAdminSupabase()
    .from('retention_offers')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    ...toOffer(r),
    status: String(r.status) as OfferView['status'],
  }));
}

export async function runOfferAction(actor: Actor, input: OfferAction): Promise<void> {
  if (actor.role !== 'super_admin' && actor.role !== 'ceo') throw new ForbiddenError();
  const admin = getAdminSupabase();
  if (input.action === 'save') {
    if (input.couponCode) {
      const c = await admin
        .from('coupons')
        .select('id')
        .eq('code', input.couponCode)
        .eq('enabled', true)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (c.error) throw new InternalError(c.error);
      if (!c.data) throw new ValidationError('This coupon code does not exist or is switched off.');
    }
    const r = await admin
      .from('retention_offers')
      .insert({
        trigger_kind: input.trigger,
        reason_code: input.reasonCode,
        title: input.title,
        message: input.message,
        coupon_code: input.couponCode,
        created_by: actor.userId,
      })
      .select('id')
      .single();
    if (r.error) throw new InternalError(r.error);
    await getService('audit').record({
      action: 'platform.retention_offer_saved',
      resourceType: 'retention_offer',
      resourceId: String(r.data.id),
      companyId: null,
      metadata: { trigger: input.trigger, reason: input.reasonCode, by: actor.userId },
    });
    return;
  }
  const r = await admin
    .from('retention_offers')
    .update({ status: input.action === 'disable' ? 'disabled' : 'active' })
    .eq('id', input.id)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: `platform.retention_offer_${input.action}d`,
    resourceType: 'retention_offer',
    resourceId: input.id,
    companyId: null,
    metadata: { by: actor.userId },
  });
}

export interface SurveySummary {
  total: number;
  saved: number;
  saveRatePercent: number | null;
  byReason: { reason: ReasonCode; trigger: Trigger; total: number; saved: number }[];
}

/** Counts of the answers of the last 180 days by reason and trigger, and how many stayed. */
export async function surveySummary(): Promise<SurveySummary> {
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const { data, error } = await getAdminSupabase()
    .from('exit_surveys')
    .select('trigger_kind, reason_code, outcome')
    .gte('created_at', since)
    .is('deleted_at', null)
    .limit(20_000);
  if (error) throw new InternalError(error);
  const table = new Map<
    string,
    { reason: ReasonCode; trigger: Trigger; total: number; saved: number }
  >();
  let saved = 0;
  for (const r of data ?? []) {
    const reason = String(r.reason_code) as ReasonCode;
    const trigger = String(r.trigger_kind) as Trigger;
    const key = `${trigger}:${reason}`;
    const cur = table.get(key) ?? { reason, trigger, total: 0, saved: 0 };
    cur.total += 1;
    if (r.outcome === 'saved') {
      cur.saved += 1;
      saved += 1;
    }
    table.set(key, cur);
  }
  const order = (x: { reason: ReasonCode; trigger: Trigger }): number =>
    TRIGGERS.indexOf(x.trigger) * 100 + REASON_CODES.indexOf(x.reason);
  return {
    total: (data ?? []).length,
    saved,
    saveRatePercent: saveRate(saved, (data ?? []).length),
    byReason: [...table.values()].sort((a, b) => order(a) - order(b)),
  };
}
