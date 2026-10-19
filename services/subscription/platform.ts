// path: services/subscription/platform.ts
// A company's own subscription to the platform: subscribe, trial, upgrade (prorated, on payment), downgrade (end of the
// cycle), cancel at the end of the cycle, reactivate, the renewal invoices, reminders, the roll-over of a paid period and
// the move to the free plan. A company that does not pay moves to the free plan; its data is never deleted or locked.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  addInterval,
  changeKind,
  extraSeatsOf,
  periodAmount,
  prorate,
  renewalInvoiceAt,
  reminderDue,
  trialExpired,
  addDaysTo,
  type Interval,
  type Proration,
  type SubscriptionStatus,
} from '@/lib/payment/subscription-rules';
import { RENEWAL_INVOICE_DAYS, TRIAL_REMINDER_DAYS } from '@/config/s14-subscriptions';
import { toInt } from '@/lib/reports/numbers';
import { type Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { usedNow } from '@/services/entitlement/usage';
import { changeCompanyPlan, impactOf } from '@/services/plan/migrate';
import { getPlanBySlug, type PlanView } from '@/services/plan/plans';
import { mailOwners } from '@/services/wallet/owner-mail';
import type { Impact } from '@/lib/payment/plan-rules';
import type { Actor } from '@/types/contracts';
import {
  createPlatformInvoice,
  findByOperatorInvoice,
  getPlatformInvoice,
  setPaid,
  setVoid,
  type PlatformInvoiceView,
} from './invoices';

const log = createLogger({ component: 'subscriptions' });

export interface SubscriptionView {
  id: string;
  companyId: string;
  planSlug: string;
  interval: Interval;
  status: SubscriptionStatus | 'incomplete';
  seats: number;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelReason: string | null;
  pendingPlanSlug: string | null;
  pendingInterval: Interval | null;
  pendingKind: 'on_payment' | 'period_end' | null;
  dunningAttempts: number;
  nextDunningAt: string | null;
  graceEndsAt: string | null;
  version: number;
}

export const SUB_COLUMNS =
  'id, company_id, plan_slug, interval, status, seats, trial_ends_at, trial_used, current_period_start, current_period_end, cancel_at_period_end, cancel_reason, pending_plan_slug, pending_interval, pending_kind, dunning_attempts, next_dunning_at, grace_ends_at, version';

export interface SubRow {
  id: string;
  company_id: string;
  plan_slug: string;
  interval: Interval;
  status: SubscriptionView['status'];
  seats: number;
  trial_ends_at: string | null;
  trial_used: boolean;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  cancel_reason: string | null;
  pending_plan_slug: string | null;
  pending_interval: Interval | null;
  pending_kind: 'on_payment' | 'period_end' | null;
  dunning_attempts: number;
  next_dunning_at: string | null;
  grace_ends_at: string | null;
  version: number;
}

export const toSubView = (r: SubRow): SubscriptionView => ({
  id: r.id,
  companyId: r.company_id,
  planSlug: r.plan_slug,
  interval: r.interval,
  status: r.status,
  seats: r.seats,
  trialEndsAt: r.trial_ends_at,
  currentPeriodStart: r.current_period_start,
  currentPeriodEnd: r.current_period_end,
  cancelAtPeriodEnd: r.cancel_at_period_end,
  cancelReason: r.cancel_reason,
  pendingPlanSlug: r.pending_plan_slug,
  pendingInterval: r.pending_interval,
  pendingKind: r.pending_kind,
  dunningAttempts: r.dunning_attempts,
  nextDunningAt: r.next_dunning_at,
  graceEndsAt: r.grace_ends_at,
  version: r.version,
});

export async function getSubRow(companyId: string): Promise<SubRow | null> {
  const { data, error } = await getAdminSupabase()
    .from('platform_subscriptions')
    .select(SUB_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return (data as SubRow | null) ?? null;
}

export async function getSubscription(companyId: string): Promise<SubscriptionView | null> {
  const row = await getSubRow(companyId);
  return row ? toSubView(row) : null;
}

export async function subscriptionEvents(
  companyId: string,
  limit = 50,
): Promise<{ event: string; detail: Record<string, unknown>; at: string }[]> {
  const { data, error } = await getAdminSupabase()
    .from('subscription_events')
    .select('event, detail, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new InternalError(error);
  return (data ?? []).map((e) => ({
    event: String(e.event),
    detail: e.detail as Record<string, unknown>,
    at: String(e.created_at),
  }));
}

export async function logEvent(
  sub: Pick<SubRow, 'id' | 'company_id'>,
  event: string,
  detail: Record<string, unknown>,
  actorId: string | null,
): Promise<void> {
  const { error } = await getAdminSupabase().from('subscription_events').insert({
    company_id: sub.company_id,
    subscription_id: sub.id,
    event,
    detail,
    actor_id: actorId,
  });
  if (error) throw new InternalError(error);
}

/** Saves a change when nobody else changed the row meanwhile. */
export async function patchSub(sub: SubRow, patch: Record<string, unknown>): Promise<SubRow> {
  const { data, error } = await getAdminSupabase()
    .from('platform_subscriptions')
    .update(patch)
    .eq('id', sub.id)
    .eq('version', sub.version)
    .select(SUB_COLUMNS)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data)
    throw new ConflictError('The subscription was changed by someone else. Reload and try again.');
  return data as SubRow;
}

async function publish(
  name: 'subscription.created' | 'subscription.renewed' | 'subscription.cancelled',
  sub: SubRow,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await getService('events').publish({
      name,
      companyId: sub.company_id,
      payload: { subscriptionId: sub.id, plan: sub.plan_slug, interval: sub.interval, ...extra },
    });
  } catch (error) {
    log.error('subscription event not published', { name, error: String(error) });
  }
}

function owner(actor: Actor): string {
  if (!actor.companyId) throw new ForbiddenError();
  return actor.companyId;
}

async function requireManage(actor: Actor): Promise<string> {
  const companyId = owner(actor);
  if (
    !(await getService('permissions').can(actor, 'subscription.manage', { type: 'subscription' }))
  )
    throw new ForbiddenError();
  return companyId;
}

async function planOrFail(slug: string): Promise<PlanView> {
  const plan = await getPlanBySlug(slug);
  if (!plan) throw new NotFoundError();
  return plan;
}

/** What one period of a plan costs this company now (the plan price plus seats above the included seats). */
export async function amountFor(
  companyId: string,
  plan: PlanView,
  interval: Interval,
): Promise<Money> {
  const included = plan.entitlements['staff.seats'];
  const seats = await usedNow(companyId, 'staff.seats');
  return periodAmount(
    plan,
    interval,
    extraSeatsOf(seats, typeof included === 'number' ? included : null),
  );
}

const planLine = (plan: PlanView, interval: Interval): string =>
  `${plan.name} plan, ${interval === 'year' ? 'yearly' : 'monthly'}`;

/* ---------------------------------------------------------------- subscribe */

export interface SubscribeInput {
  planSlug: string;
  interval: Interval;
  /** The idempotency key of the request: a retry makes one invoice. */
  requestKey: string;
}

export interface SubscribeResult {
  subscription: SubscriptionView;
  invoice: PlatformInvoiceView | null;
  message: string;
}

async function voidOpenInvoices(subscriptionId: string): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('platform_invoices')
    .select('id')
    .eq('subscription_id', subscriptionId)
    .eq('status', 'open')
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  for (const r of data ?? []) await setVoid(String(r.id), 'void');
}

/** Starts a subscription. With a trial the plan is on at once; otherwise the plan starts when the first invoice is paid. */
export async function subscribe(actor: Actor, input: SubscribeInput): Promise<SubscribeResult> {
  const companyId = await requireManage(actor);
  if (input.requestKey.length < 8) throw new ValidationError('The request key is too short.');
  const plan = await planOrFail(input.planSlug);
  if (plan.status !== 'active')
    throw new ValidationError('This plan is not available for new subscriptions.');
  let sub = await getSubRow(companyId);
  if (sub && ['trialing', 'active', 'past_due', 'grace'].includes(sub.status)) {
    throw new ConflictError('You already have a subscription. Use change plan instead.');
  }
  const now = new Date();
  const amount = await amountFor(companyId, plan, input.interval);
  const canTrial = plan.trialDays > 0 && !(sub?.trial_used ?? false) && amount.isPositive();
  const periodEnd = addInterval(now, input.interval);

  if (!amount.isPositive()) {
    // A plan with no price is on at once, no invoice.
    const values = {
      plan_slug: plan.slug,
      interval: input.interval,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      cancel_reason: null,
      cancelled_at: null,
      pending_plan_slug: null,
      pending_interval: null,
      pending_kind: null,
      dunning_attempts: 0,
      next_dunning_at: null,
      grace_ends_at: null,
      ended_at: null,
      trial_ends_at: null,
    };
    sub = sub ? await patchSub(sub, values) : await insertSub(companyId, values);
    await changeCompanyPlan(
      companyId,
      plan.slug,
      actor.userId,
      'Subscribed to a plan without a price',
    );
    await logEvent(sub, 'subscribed', { plan: plan.slug, free: true }, actor.userId);
    await publish('subscription.created', sub);
    return { subscription: toSubView(sub), invoice: null, message: 'Your plan is active.' };
  }

  const trialEnd = canTrial ? addDaysTo(now, plan.trialDays) : null;
  const firstStart = trialEnd ?? now;
  const firstEnd = addInterval(firstStart, input.interval);
  const values = {
    plan_slug: plan.slug,
    interval: input.interval,
    status: trialEnd ? 'trialing' : 'incomplete',
    trial_ends_at: trialEnd?.toISOString() ?? null,
    trial_used: (sub?.trial_used ?? false) || Boolean(trialEnd),
    current_period_start: now.toISOString(),
    current_period_end: (trialEnd ?? firstEnd).toISOString(),
    cancel_at_period_end: false,
    cancel_reason: null,
    cancelled_at: null,
    pending_plan_slug: null,
    pending_interval: null,
    pending_kind: null,
    dunning_attempts: 0,
    next_dunning_at: null,
    grace_ends_at: null,
    ended_at: null,
  };
  if (sub) await voidOpenInvoices(sub.id);
  sub = sub ? await patchSub(sub, values) : await insertSub(companyId, values);
  if (trialEnd) await changeCompanyPlan(companyId, plan.slug, actor.userId, 'Trial started');
  const invoice = await createPlatformInvoice({
    companyId,
    subscriptionId: sub.id,
    kind: 'subscription',
    description: planLine(plan, input.interval),
    items: [{ description: planLine(plan, input.interval), quantity: 1, unitAmount: amount }],
    periodStart: firstStart,
    periodEnd: firstEnd,
    dueAt: trialEnd ?? addDaysTo(now, 7),
    idempotencyKey: `first:${input.requestKey}`.slice(0, 160),
    createdBy: actor.userId,
  });
  await logEvent(
    sub,
    trialEnd ? 'trial_started' : 'subscribed',
    { plan: plan.slug, interval: input.interval, invoice: invoice.number },
    actor.userId,
  );
  await publish('subscription.created', sub, { trial: Boolean(trialEnd) });
  return {
    subscription: toSubView(sub),
    invoice,
    message: trialEnd
      ? `Your ${plan.name} trial has started. Pay the first invoice before ${trialEnd.toISOString().slice(0, 10)} to keep the plan.`
      : 'Pay the invoice to start your plan.',
  };
}

async function insertSub(companyId: string, values: Record<string, unknown>): Promise<SubRow> {
  const { data, error } = await getAdminSupabase()
    .from('platform_subscriptions')
    .insert({ company_id: companyId, ...values })
    .select(SUB_COLUMNS)
    .single();
  if (error) throw new InternalError(error);
  return data as SubRow;
}

/* ---------------------------------------------------------------- change, cancel, reactivate */

export interface ChangeResult {
  kind: 'upgrade' | 'downgrade' | 'same' | 'interval';
  proration: Proration | null;
  invoice: PlatformInvoiceView | null;
  overLimit: Impact[];
  message: string;
}

/** Upgrade (prorated by the day, on payment), downgrade (at the end of the cycle) or a change of interval (end of the cycle). */
export async function changePlan(actor: Actor, input: SubscribeInput): Promise<ChangeResult> {
  const companyId = await requireManage(actor);
  const sub = await getSubRow(companyId);
  if (!sub || !['trialing', 'active'].includes(sub.status))
    throw new ValidationError('Subscribe first, or pay the open invoice.');
  const [oldPlan, newPlan] = await Promise.all([
    planOrFail(sub.plan_slug),
    planOrFail(input.planSlug),
  ]);
  if (newPlan.status !== 'active') throw new ValidationError('This plan is not available.');
  const [oldAmount, newAmount] = await Promise.all([
    amountFor(companyId, oldPlan, sub.interval),
    amountFor(companyId, newPlan, input.interval),
  ]);
  const overLimit = await impactOf(companyId, newPlan.slug);
  const now = new Date();

  if (sub.status === 'trialing') {
    // During a trial the plan simply changes and the first invoice is made again at the new price.
    await voidOpenInvoices(sub.id);
    const trialEnd = new Date(sub.trial_ends_at ?? sub.current_period_end);
    const updated = await patchSub(sub, { plan_slug: newPlan.slug, interval: input.interval });
    await changeCompanyPlan(companyId, newPlan.slug, actor.userId, 'Plan changed during the trial');
    const invoice = newAmount.isPositive()
      ? await createPlatformInvoice({
          companyId,
          subscriptionId: sub.id,
          kind: 'subscription',
          description: planLine(newPlan, input.interval),
          items: [
            { description: planLine(newPlan, input.interval), quantity: 1, unitAmount: newAmount },
          ],
          periodStart: trialEnd,
          periodEnd: addInterval(trialEnd, input.interval),
          dueAt: trialEnd,
          idempotencyKey: `first:${input.requestKey}`.slice(0, 160),
          createdBy: actor.userId,
        })
      : null;
    await logEvent(updated, 'plan_changed', { to: newPlan.slug, trial: true }, actor.userId);
    return {
      kind: changeKind(oldAmount, newAmount),
      proration: null,
      invoice,
      overLimit,
      message: 'Your trial plan was changed.',
    };
  }

  if (input.interval !== sub.interval) {
    const updated = await patchSub(sub, {
      pending_plan_slug: newPlan.slug === sub.plan_slug ? null : newPlan.slug,
      pending_interval: input.interval,
      pending_kind: 'period_end',
    });
    await logEvent(
      updated,
      'change_scheduled',
      { plan: newPlan.slug, interval: input.interval },
      actor.userId,
    );
    return {
      kind: 'interval',
      proration: null,
      invoice: null,
      overLimit,
      message: `The change starts on ${sub.current_period_end.slice(0, 10)}.`,
    };
  }

  const kind = changeKind(oldAmount, newAmount);
  if (kind === 'same' && newPlan.slug === sub.plan_slug)
    throw new ValidationError('You are already on this plan.');
  if (kind === 'downgrade' || kind === 'same') {
    const updated = await patchSub(sub, {
      pending_plan_slug: newPlan.slug,
      pending_interval: null,
      pending_kind: 'period_end',
    });
    await logEvent(updated, 'change_scheduled', { plan: newPlan.slug }, actor.userId);
    return {
      kind: 'downgrade',
      proration: null,
      invoice: null,
      overLimit,
      message: `Your plan changes on ${sub.current_period_end.slice(0, 10)}. Nothing is deleted.`,
    };
  }

  const proration = prorate({
    oldAmount,
    newAmount,
    periodStart: new Date(sub.current_period_start),
    periodEnd: new Date(sub.current_period_end),
    at: now,
  });
  if (!proration.net.isPositive()) {
    await patchSub(sub, { plan_slug: newPlan.slug });
    await changeCompanyPlan(companyId, newPlan.slug, actor.userId, 'Upgrade with nothing to pay');
    return {
      kind: 'upgrade',
      proration,
      invoice: null,
      overLimit,
      message: 'Your plan was upgraded.',
    };
  }
  const updated = await patchSub(sub, {
    pending_plan_slug: newPlan.slug,
    pending_interval: null,
    pending_kind: 'on_payment',
  });
  const invoice = await createPlatformInvoice({
    companyId,
    subscriptionId: sub.id,
    kind: 'upgrade',
    description: `Upgrade to ${newPlan.name} for the ${proration.remainingDays} days left`,
    items: [
      {
        description: `Upgrade ${oldPlan.name} to ${newPlan.name}, ${proration.remainingDays} of ${proration.totalDays} days`,
        quantity: 1,
        unitAmount: proration.net,
      },
    ],
    periodStart: now,
    periodEnd: new Date(sub.current_period_end),
    dueAt: addDaysTo(now, 3),
    idempotencyKey: `up:${input.requestKey}`.slice(0, 160),
    createdBy: actor.userId,
  });
  await logEvent(
    updated,
    'upgrade_requested',
    { to: newPlan.slug, invoice: invoice.number },
    actor.userId,
  );
  return {
    kind: 'upgrade',
    proration,
    invoice,
    overLimit,
    message: 'Pay the invoice and your plan is upgraded at once.',
  };
}

export async function cancelSubscription(actor: Actor, reason: string): Promise<SubscriptionView> {
  const companyId = await requireManage(actor);
  const sub = await getSubRow(companyId);
  if (!sub || sub.status === 'ended')
    throw new ValidationError('There is no subscription to cancel.');
  const clean = reason.trim().slice(0, 300);
  if (clean.length < 3) throw new ValidationError('Tell us why in at least 3 letters.');
  const updated = await patchSub(sub, {
    cancel_at_period_end: true,
    cancel_reason: clean,
    cancelled_at: new Date().toISOString(),
  });
  await logEvent(updated, 'cancel_requested', { reason: clean }, actor.userId);
  await getService('audit').record({
    action: 'subscription.cancel_requested',
    resourceType: 'subscription',
    resourceId: sub.id,
    companyId,
    metadata: { reason: clean },
  });
  return toSubView(updated);
}

export async function reactivateSubscription(actor: Actor): Promise<SubscriptionView> {
  const companyId = await requireManage(actor);
  const sub = await getSubRow(companyId);
  if (!sub) throw new NotFoundError();
  if (sub.status === 'ended')
    throw new ValidationError('The subscription has ended. Subscribe again to start a plan.');
  if (!sub.cancel_at_period_end) throw new ValidationError('The subscription is not cancelled.');
  const updated = await patchSub(sub, {
    cancel_at_period_end: false,
    cancel_reason: null,
    cancelled_at: null,
  });
  await logEvent(updated, 'reactivated', {}, actor.userId);
  await getService('audit').record({
    action: 'subscription.reactivated',
    resourceType: 'subscription',
    resourceId: sub.id,
    companyId,
    metadata: {},
  });
  return toSubView(updated);
}

/* ---------------------------------------------------------------- payment */

function receiptMail(invoice: PlatformInvoiceView): Promise<void> {
  return mailOwners(
    invoice.companyId,
    'billing.receipt',
    {
      companyName: invoice.buyerName,
      number: invoice.number,
      total: `${invoice.total} USD`,
      paidAt: (invoice.paidAt ?? '').slice(0, 10),
      link: `/subscriptions/billing/invoices/${invoice.id}`,
    },
    `pinv-receipt:${invoice.id}`,
  );
}

/** Moves a paid, due subscription to its next period (and applies a plan change waiting for the end of the cycle). */
async function rollover(
  sub: SubRow,
  invoice: PlatformInvoiceView,
  actorId: string | null,
): Promise<SubRow> {
  const nextPlan =
    sub.pending_kind === 'period_end' && sub.pending_plan_slug
      ? sub.pending_plan_slug
      : sub.plan_slug;
  const nextInterval =
    sub.pending_kind === 'period_end' && sub.pending_interval ? sub.pending_interval : sub.interval;
  const start = invoice.periodStart
    ? new Date(invoice.periodStart)
    : new Date(sub.current_period_end);
  const end = invoice.periodEnd ? new Date(invoice.periodEnd) : addInterval(start, nextInterval);
  const updated = await patchSub(sub, {
    plan_slug: nextPlan,
    interval: nextInterval,
    status: 'active',
    current_period_start: start.toISOString(),
    current_period_end: end.toISOString(),
    pending_plan_slug: sub.pending_kind === 'period_end' ? null : sub.pending_plan_slug,
    pending_interval: sub.pending_kind === 'period_end' ? null : sub.pending_interval,
    pending_kind: sub.pending_kind === 'period_end' ? null : sub.pending_kind,
    dunning_attempts: 0,
    next_dunning_at: null,
    grace_ends_at: null,
    trial_ends_at: null,
  });
  if (nextPlan !== sub.plan_slug)
    await changeCompanyPlan(sub.company_id, nextPlan, actorId, 'Plan changed at renewal');
  await logEvent(
    updated,
    'renewed',
    { plan: nextPlan, until: end.toISOString().slice(0, 10), invoice: invoice.number },
    actorId,
  );
  await publish('subscription.renewed', updated, { invoice: invoice.number });
  return updated;
}

/**
 * Records that an invoice was paid and does what the payment means: starts the first period, applies a paid upgrade,
 * clears a payment problem, rolls a due period forward. Safe to call again for the same invoice: nothing happens twice.
 */
export async function payInvoice(input: {
  invoiceId: string;
  method: string;
  reference: string;
  actorId: string | null;
  at?: Date;
}): Promise<PlatformInvoiceView> {
  const at = input.at ?? new Date();
  const { invoice, changed } = await setPaid(input.invoiceId, {
    method: input.method,
    reference: input.reference,
    at,
  });
  if (!changed) return invoice;
  await getService('audit').record({
    action: 'subscription.invoice_paid',
    resourceType: 'platform_invoice',
    resourceId: invoice.id,
    companyId: invoice.companyId,
    metadata: { number: invoice.number, method: input.method, by: input.actorId },
  });
  await receiptMail(invoice);
  if (!invoice.subscriptionId) return invoice;
  const sub = await getSubRow(invoice.companyId);
  if (!sub || sub.id !== invoice.subscriptionId) return invoice;
  try {
    if (invoice.kind === 'upgrade' && sub.pending_kind === 'on_payment' && sub.pending_plan_slug) {
      const updated = await patchSub(sub, {
        plan_slug: sub.pending_plan_slug,
        pending_plan_slug: null,
        pending_interval: null,
        pending_kind: null,
      });
      await changeCompanyPlan(sub.company_id, sub.pending_plan_slug, input.actorId, 'Upgrade paid');
      await logEvent(
        updated,
        'upgraded',
        { plan: updated.plan_slug, invoice: invoice.number },
        input.actorId,
      );
      return invoice;
    }
    if (invoice.kind !== 'subscription') return invoice;
    if (sub.status === 'incomplete') {
      const start = invoice.periodStart ? new Date(invoice.periodStart) : at;
      const updated = await patchSub(sub, {
        status: 'active',
        current_period_start: start.toISOString(),
        current_period_end: (invoice.periodEnd
          ? new Date(invoice.periodEnd)
          : addInterval(start, sub.interval)
        ).toISOString(),
      });
      await changeCompanyPlan(sub.company_id, sub.plan_slug, input.actorId, 'First invoice paid');
      await logEvent(
        updated,
        'activated',
        { plan: sub.plan_slug, invoice: invoice.number },
        input.actorId,
      );
      return invoice;
    }
    if (
      sub.status === 'past_due' ||
      sub.status === 'grace' ||
      (sub.status === 'active' && new Date(sub.current_period_end) <= at)
    ) {
      await rollover(sub, invoice, input.actorId);
    }
  } catch (thrown) {
    // The invoice is paid and stays paid; the hourly job finishes what this step could not.
    log.error('payment applied only in part', { invoiceId: invoice.id, error: String(thrown) });
  }
  return invoice;
}

/* ---------------------------------------------------------------- ending */

/** Ends the subscription and moves the company to the free plan. Data is kept. */
export async function endSubscription(
  sub: SubRow,
  reason: string,
  kind: 'cancelled' | 'unpaid' | 'trial_unpaid' | 'admin',
  actorId: string | null,
): Promise<SubRow> {
  const now = new Date();
  const updated = await patchSub(sub, {
    status: 'ended',
    ended_at: now.toISOString(),
    next_dunning_at: null,
    grace_ends_at: null,
    pending_plan_slug: null,
    pending_interval: null,
    pending_kind: null,
  });
  if (kind === 'unpaid' || kind === 'trial_unpaid') await voidUnpaid(sub.id);
  const wasPlan = await getPlanBySlug(sub.plan_slug);
  await changeCompanyPlan(sub.company_id, 'free', actorId, reason);
  await logEvent(updated, 'ended', { reason, kind }, actorId);
  await publish('subscription.cancelled', updated, { reason, kind });
  await mailOwners(
    sub.company_id,
    'billing.downgraded',
    {
      companyName: 'your company',
      planName: wasPlan?.name ?? sub.plan_slug,
      reason,
      link: '/subscriptions/billing',
    },
    `downgraded:${sub.id}:${now.toISOString().slice(0, 10)}`,
  );
  return updated;
}

async function voidUnpaid(subscriptionId: string): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('platform_invoices')
    .select('id')
    .eq('subscription_id', subscriptionId)
    .eq('status', 'open')
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  for (const r of data ?? []) await setVoid(String(r.id), 'uncollectible');
}

/* ---------------------------------------------------------------- hourly work */

async function nextPeriodInvoice(sub: SubRow): Promise<PlatformInvoiceView | null> {
  const { data, error } = await getAdminSupabase()
    .from('platform_invoices')
    .select('id')
    .eq('subscription_id', sub.id)
    .eq('kind', 'subscription')
    .eq('period_start', new Date(sub.current_period_end).toISOString())
    .neq('status', 'void')
    .is('deleted_at', null)
    .order('issued_at', { ascending: false })
    .limit(1);
  if (error) throw new InternalError(error);
  const id = data?.[0]?.id;
  return id ? getPlatformInvoice(String(id), null) : null;
}

/** Makes the renewal invoice a few days before the period ends. Returns the invoice (made now or earlier). */
async function ensureRenewalInvoice(sub: SubRow): Promise<PlatformInvoiceView | null> {
  const end = new Date(sub.current_period_end);
  const planSlug =
    sub.pending_kind === 'period_end' && sub.pending_plan_slug
      ? sub.pending_plan_slug
      : sub.plan_slug;
  const interval =
    sub.pending_kind === 'period_end' && sub.pending_interval ? sub.pending_interval : sub.interval;
  const plan = await getPlanBySlug(planSlug);
  if (!plan) return null;
  const amount = await amountFor(sub.company_id, plan, interval);
  if (!amount.isPositive()) return null;
  return createPlatformInvoice({
    companyId: sub.company_id,
    subscriptionId: sub.id,
    kind: 'subscription',
    description: planLine(plan, interval),
    items: [{ description: planLine(plan, interval), quantity: 1, unitAmount: amount }],
    periodStart: end,
    periodEnd: addInterval(end, interval),
    dueAt: end,
    idempotencyKey: `renew:${sub.id}:${end.toISOString().slice(0, 10)}`,
    createdBy: null,
  });
}

async function remindersSent(sub: SubRow): Promise<Set<number>> {
  const tag = new Date(sub.current_period_end).toISOString().slice(0, 10);
  const { data, error } = await getAdminSupabase()
    .from('subscription_events')
    .select('event')
    .eq('subscription_id', sub.id)
    .like('event', `reminder_%:${tag}`);
  if (error) throw new InternalError(error);
  return new Set(
    (data ?? [])
      .map((r) => toInt(String(r.event).slice('reminder_'.length), 0))
      .filter((n) => n > 0),
  );
}

/** Renewal invoices, reminders, roll-over of paid periods, cancellations, and the end of trials. Safe to run again. */
export async function runRenewals(
  now: Date = new Date(),
): Promise<{ invoiced: number; renewed: number; ended: number }> {
  const admin = getAdminSupabase();
  const result = { invoiced: 0, renewed: 0, ended: 0 };
  const { data, error } = await admin
    .from('platform_subscriptions')
    .select(SUB_COLUMNS)
    .in('status', ['active', 'trialing'])
    .lte('current_period_end', addDaysTo(now, RENEWAL_INVOICE_DAYS + 1).toISOString())
    .is('deleted_at', null)
    .order('current_period_end')
    .limit(500);
  if (error) throw new InternalError(error);
  for (const sub of (data ?? []) as SubRow[]) {
    try {
      const end = new Date(sub.current_period_end);
      if (sub.status === 'trialing') {
        await handleTrial(sub, now, result);
        continue;
      }
      if (sub.cancel_at_period_end) {
        if (end <= now) {
          await endSubscription(
            sub,
            sub.cancel_reason ?? 'Cancelled by the owner',
            'cancelled',
            null,
          );
          result.ended += 1;
        }
        continue;
      }
      if (now >= renewalInvoiceAt(end)) {
        const existing = await nextPeriodInvoice(sub);
        const invoice = existing ?? (await ensureRenewalInvoice(sub));
        if (invoice && !existing) result.invoiced += 1;
        if (invoice && invoice.status === 'open') {
          const day = reminderDue(end, now, await remindersSent(sub));
          if (day !== null) {
            const plan = await getPlanBySlug(sub.plan_slug);
            await mailOwners(
              sub.company_id,
              'billing.renewal-reminder',
              {
                companyName: invoice.buyerName,
                planName: plan?.name ?? sub.plan_slug,
                renewsOn: end.toISOString().slice(0, 10),
                total: `${invoice.total} USD`,
                daysLeft: String(day),
                link: `/subscriptions/billing/invoices/${invoice.id}`,
              },
              `renewal:${sub.id}:${end.toISOString().slice(0, 10)}:${day}`,
            );
            await logEvent(
              sub,
              `reminder_${day}:${end.toISOString().slice(0, 10)}`,
              { invoice: invoice.number },
              null,
            );
          }
        }
        if (end <= now) {
          if (invoice?.status === 'paid') {
            await rollover(sub, invoice, null);
            result.renewed += 1;
          } else {
            await patchSub(sub, { status: 'past_due', next_dunning_at: end.toISOString() });
            await logEvent(sub, 'past_due', { invoice: invoice?.number ?? null }, null);
          }
        }
      }
    } catch (thrown) {
      log.error('renewal step failed', { subscriptionId: sub.id, error: String(thrown) });
    }
  }
  return result;
}

async function handleTrial(
  sub: SubRow,
  now: Date,
  result: { renewed: number; ended: number },
): Promise<void> {
  const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  if (!trialEnd) return;
  const { data, error } = await getAdminSupabase()
    .from('platform_invoices')
    .select('id, status')
    .eq('subscription_id', sub.id)
    .eq('kind', 'subscription')
    .eq('period_start', trialEnd.toISOString())
    .neq('status', 'void')
    .is('deleted_at', null)
    .limit(1);
  if (error) throw new InternalError(error);
  const first = data?.[0];
  if (!trialExpired(trialEnd, now)) {
    const left = (trialEnd.getTime() - now.getTime()) / 86_400_000;
    if (left <= TRIAL_REMINDER_DAYS && first?.status === 'open') {
      const tag = `trial_reminder:${trialEnd.toISOString().slice(0, 10)}`;
      const seen = await getAdminSupabase()
        .from('subscription_events')
        .select('id')
        .eq('subscription_id', sub.id)
        .eq('event', tag)
        .limit(1);
      if (!seen.error && (seen.data ?? []).length === 0) {
        const plan = await getPlanBySlug(sub.plan_slug);
        await mailOwners(
          sub.company_id,
          'billing.trial-ending',
          {
            companyName: 'your company',
            planName: plan?.name ?? sub.plan_slug,
            endsOn: trialEnd.toISOString().slice(0, 10),
            link: `/subscriptions/billing/invoices/${String(first.id)}`,
          },
          `trial:${sub.id}:${trialEnd.toISOString().slice(0, 10)}`,
        );
        await logEvent(sub, tag, {}, null);
      }
    }
    return;
  }
  if (first?.status === 'paid') {
    await rollover(sub, await getPlatformInvoice(String(first.id), null), null);
    result.renewed += 1;
    return;
  }
  await endSubscription(sub, 'The trial ended without a payment', 'trial_unpaid', null);
  result.ended += 1;
}

/* ---------------------------------------------------------------- platform team */

export async function listSubscriptions(
  actor: Actor,
  filter: { plan?: string; status?: string; limit?: number } = {},
): Promise<(SubscriptionView & { companyName: string })[]> {
  if (!['super_admin', 'ceo', 'admin_staff'].includes(actor.role)) throw new ForbiddenError();
  let q = getAdminSupabase()
    .from('platform_subscriptions')
    .select(SUB_COLUMNS)
    .is('deleted_at', null)
    .order('current_period_end')
    .limit(Math.min(Math.max(filter.limit ?? 100, 1), 300));
  if (filter.plan) q = q.eq('plan_slug', filter.plan);
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const rows = (data ?? []) as SubRow[];
  const names = new Map<string, string>();
  if (rows.length > 0) {
    const c = await getAdminSupabase()
      .from('companies')
      .select('id, name')
      .in(
        'id',
        rows.map((r) => r.company_id),
      );
    if (c.error) throw new InternalError(c.error);
    for (const x of c.data ?? []) names.set(String(x.id), String(x.name));
  }
  return rows.map((r) => ({
    ...toSubView(r),
    companyName: names.get(r.company_id) ?? r.company_id,
  }));
}

/** The platform team gives a company a plan without an invoice (a gift, a deal, a correction), or ends its subscription. */
export async function adminSetPlan(
  actor: Actor,
  companyId: string,
  planSlug: string,
  note: string,
): Promise<void> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  if (note.trim().length < 3) throw new ValidationError('Give a reason of at least 3 letters.');
  await planOrFail(planSlug);
  await changeCompanyPlan(companyId, planSlug, actor.userId, note.trim());
  const sub = await getSubRow(companyId);
  if (sub) {
    const updated = await patchSub(sub, {
      plan_slug: planSlug,
      pending_plan_slug: null,
      pending_interval: null,
      pending_kind: null,
    });
    await logEvent(updated, 'admin_plan_set', { plan: planSlug, note: note.trim() }, actor.userId);
  }
  await getService('audit').record({
    action: 'subscription.admin_plan_set',
    resourceType: 'company',
    resourceId: companyId,
    companyId,
    metadata: { plan: planSlug, note: note.trim() },
  });
}

/** Adds days to the current period (for example after an outage). */
export async function adminExtend(
  actor: Actor,
  companyId: string,
  days: number,
  note: string,
): Promise<SubscriptionView> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  if (!Number.isInteger(days) || days < 1 || days > 90)
    throw new ValidationError('Choose between 1 and 90 days.');
  if (note.trim().length < 3) throw new ValidationError('Give a reason of at least 3 letters.');
  const sub = await getSubRow(companyId);
  if (!sub || sub.status === 'ended') throw new NotFoundError();
  const updated = await patchSub(sub, {
    current_period_end: addDaysTo(new Date(sub.current_period_end), days).toISOString(),
    ...(sub.trial_ends_at
      ? { trial_ends_at: addDaysTo(new Date(sub.trial_ends_at), days).toISOString() }
      : {}),
  });
  await logEvent(updated, 'admin_extended', { days, note: note.trim() }, actor.userId);
  await getService('audit').record({
    action: 'subscription.admin_extended',
    resourceType: 'subscription',
    resourceId: sub.id,
    companyId,
    metadata: { days, note: note.trim() },
  });
  return toSubView(updated);
}

/** The platform team records a bank transfer against an open invoice. */
export async function recordBankPayment(
  actor: Actor,
  invoiceId: string,
  reference: string,
): Promise<PlatformInvoiceView> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const clean = reference.trim();
  if (!/^[A-Za-z0-9 ._:/-]{3,120}$/.test(clean))
    throw new ValidationError('Enter the bank reference (3 to 120 letters, digits or . _ : / -).');
  return payInvoice({
    invoiceId,
    method: 'bank_transfer',
    reference: clean,
    actorId: actor.userId,
  });
}

/** The online payment of the operator company's invoice arrived (request R12): settle the matching platform invoice. */
export async function markPaidByOperator(
  operatorInvoiceId: string,
  reference: string,
): Promise<PlatformInvoiceView | null> {
  const invoice = await findByOperatorInvoice(operatorInvoiceId);
  if (!invoice) return null;
  return payInvoice({ invoiceId: invoice.id, method: 'online', reference, actorId: null });
}
