// path: services/subscription/client-subscriptions.ts
// A company's own clients on its recurring plans: start (with an optional trial), pause and resume, cancel at the end of
// the cycle or at once, and change plan or seats (an upgrade is prorated by the day and billed at once; a downgrade starts
// with the next cycle). Only the owner manages subscriptions; staff can look. The client has no login: a client's own
// pause or cancel through the portal is a request to the portal STEP (R13).
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
import { cycleAmount } from '@/lib/payment/client-subscription-rules';
import { addDaysTo, addInterval, changeKind, prorate } from '@/lib/payment/subscription-rules';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { billSubscription, billUpgrade, resumeRow } from './client-billing';
import { getClientPlan } from './client-plans';
import {
  CLIENT_SUB_COLUMNS,
  loadClientSub,
  logClientSub,
  patchClientSub,
  priced,
  toClientSubView,
  type ClientSubRow,
  type ClientSubView,
} from './client-store';

const log = createLogger({ component: 'client-subscriptions' });

async function requireManage(actor: Actor): Promise<string> {
  if (!actor.companyId) throw new ForbiddenError();
  if (
    !(await getService('permissions').can(actor, 'client_subscription.manage', {
      type: 'client_subscription',
    }))
  )
    throw new ForbiddenError();
  return actor.companyId;
}

async function audit(
  action: string,
  sub: Pick<ClientSubRow, 'id' | 'company_id'>,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action: `client_subscription.${action}`,
    resourceType: 'client_subscription',
    resourceId: sub.id,
    companyId: sub.company_id,
    metadata,
  });
}

export interface StartInput {
  clientId: string;
  planId: string;
  seats?: number;
}

/** A client joins a plan. With a trial the first invoice comes at its end; without one the first invoice is made at once. */
export async function startClientSubscription(
  actor: Actor,
  input: StartInput,
): Promise<ClientSubView> {
  const companyId = await requireManage(actor);
  const seats = input.seats ?? 1;
  if (!Number.isInteger(seats) || seats < 1 || seats > 10000)
    throw new ValidationError('Seats must be a whole number from 1 to 10000.');
  const [plan] = await Promise.all([
    getClientPlan(companyId, input.planId),
    getService('clients').getById(input.clientId),
  ]);
  if (plan.status !== 'active')
    throw new ValidationError('This plan is not open to new subscribers.');
  const client = await getAdminSupabase()
    .from('clients')
    .select('id')
    .eq('id', input.clientId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (client.error) throw new InternalError(client.error);
  if (!client.data) throw new NotFoundError();
  const now = new Date();
  const trialEnd = plan.trialDays > 0 ? addDaysTo(now, plan.trialDays) : null;
  const periodEnd = trialEnd ?? addInterval(now, plan.interval);
  const { data, error } = await getAdminSupabase()
    .from('client_subscriptions')
    .insert({
      company_id: companyId,
      client_id: input.clientId,
      plan_id: plan.id,
      status: trialEnd ? 'trialing' : 'active',
      interval: plan.interval,
      price: plan.price,
      seat_price: plan.seatPrice,
      included_seats: plan.includedSeats,
      seats,
      trial_ends_at: trialEnd?.toISOString() ?? null,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      next_billing_at: (trialEnd ?? now).toISOString(),
      created_by: actor.userId,
    })
    .select(CLIENT_SUB_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('This client is already on this plan.');
    throw new InternalError(error);
  }
  const sub = data as unknown as ClientSubRow;
  await logClientSub(
    sub,
    trialEnd ? 'trial_started' : 'started',
    { plan: plan.name, seats },
    actor.userId,
  );
  await audit('started', sub, { plan: plan.name, clientId: input.clientId });
  await getService('events')
    .publish({
      name: 'subscription.created',
      companyId,
      payload: { clientSubscriptionId: sub.id, clientId: input.clientId },
    })
    .catch(() => undefined);
  if (!trialEnd) {
    try {
      await billSubscription(companyId, sub.id, now);
    } catch (thrown) {
      // The subscription stands; the hourly job tries the first invoice again.
      log.error('first invoice not made', { subscriptionId: sub.id, error: String(thrown) });
    }
  }
  return toClientSubView(await loadClientSub(companyId, sub.id));
}

export async function pauseClientSubscription(
  actor: Actor,
  id: string,
  resumeOn: string | null,
): Promise<ClientSubView> {
  const companyId = await requireManage(actor);
  const sub = await loadClientSub(companyId, id);
  if (!['trialing', 'active'].includes(sub.status))
    throw new ValidationError('Only a running subscription can be paused.');
  const resumes = resumeOn ? new Date(`${resumeOn}T00:00:00Z`) : null;
  if (
    resumeOn &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(resumeOn) ||
      !resumes ||
      Number.isNaN(resumes.getTime()) ||
      resumes <= new Date())
  )
    throw new ValidationError('Choose a resume date in the future.');
  const updated = await patchClientSub(sub, {
    status: 'paused',
    paused_at: new Date().toISOString(),
    pause_resumes_at: resumes?.toISOString() ?? null,
  });
  await logClientSub(updated, 'paused', { resumeOn }, actor.userId);
  await audit('paused', updated, { resumeOn });
  return toClientSubView(updated);
}

export async function resumeClientSubscription(actor: Actor, id: string): Promise<ClientSubView> {
  const companyId = await requireManage(actor);
  const sub = await loadClientSub(companyId, id);
  const updated = await resumeRow(sub, new Date(), actor.userId);
  await audit('resumed', updated, {});
  return toClientSubView(updated);
}

/** Cancels at the end of the paid cycle, or at once. A cancelled client keeps what they already paid for. */
export async function cancelClientSubscription(
  actor: Actor,
  id: string,
  reason: string,
  immediately: boolean,
): Promise<ClientSubView> {
  const companyId = await requireManage(actor);
  const clean = reason.trim().slice(0, 300);
  if (clean.length < 3) throw new ValidationError('Give a reason of at least 3 letters.');
  const sub = await loadClientSub(companyId, id);
  if (['cancelled', 'ended'].includes(sub.status))
    throw new ValidationError('This subscription has already ended.');
  const updated = immediately
    ? await patchClientSub(sub, {
        status: 'cancelled',
        ended_at: new Date().toISOString(),
        cancel_reason: clean,
        next_billing_at: null,
        paused_at: null,
        pause_resumes_at: null,
      })
    : await patchClientSub(sub, { cancel_at_period_end: true, cancel_reason: clean });
  await logClientSub(
    updated,
    immediately ? 'cancelled' : 'cancel_requested',
    { reason: clean },
    actor.userId,
  );
  await audit(immediately ? 'cancelled' : 'cancel_requested', updated, { reason: clean });
  return toClientSubView(updated);
}

export async function keepClientSubscription(actor: Actor, id: string): Promise<ClientSubView> {
  const companyId = await requireManage(actor);
  const sub = await loadClientSub(companyId, id);
  if (!sub.cancel_at_period_end || ['cancelled', 'ended'].includes(sub.status))
    throw new ValidationError('The subscription is not set to cancel.');
  const updated = await patchClientSub(sub, { cancel_at_period_end: false, cancel_reason: null });
  await logClientSub(updated, 'cancel_withdrawn', {}, actor.userId);
  return toClientSubView(updated);
}

export interface ChangeInput {
  planId?: string;
  seats?: number;
}

export interface ClientChangeResult {
  kind: 'upgrade' | 'downgrade' | 'same';
  invoiceId: string | null;
  message: string;
  subscription: ClientSubView;
}

/** A plan or seat change. More money per cycle: prorated by the day, billed now, active now. Less: from the next cycle. */
export async function changeClientSubscription(
  actor: Actor,
  id: string,
  input: ChangeInput,
): Promise<ClientChangeResult> {
  const companyId = await requireManage(actor);
  const sub = await loadClientSub(companyId, id);
  if (!['trialing', 'active'].includes(sub.status))
    throw new ValidationError('Only a running subscription can be changed.');
  const seats = input.seats ?? sub.seats;
  if (!Number.isInteger(seats) || seats < 1 || seats > 10000)
    throw new ValidationError('Seats must be a whole number from 1 to 10000.');
  const plan =
    input.planId && input.planId !== sub.plan_id
      ? await getClientPlan(companyId, input.planId)
      : null;
  if (plan && plan.status !== 'active')
    throw new ValidationError('This plan is not open to new subscribers.');
  if (plan && plan.interval !== sub.interval)
    throw new ValidationError('Choose a plan with the same billing interval.');
  if (!plan && seats === sub.seats) throw new ValidationError('Nothing changes.');
  const next = {
    price: plan ? plan.price : Money.parseRounded(String(sub.price)).toDbString(),
    seatPrice: plan ? plan.seatPrice : Money.parseRounded(String(sub.seat_price)).toDbString(),
    includedSeats: plan ? plan.includedSeats : sub.included_seats,
    seats,
  };
  const oldAmount = cycleAmount(priced(sub));
  const newAmount = cycleAmount(next);
  const kind = changeKind(oldAmount, newAmount);
  const now = new Date();
  const endText = sub.current_period_end.slice(0, 10);

  if (sub.status === 'trialing' || kind !== 'upgrade') {
    // In a trial nothing is billed yet, so the change is simply made; a cheaper change waits for the next cycle.
    if (sub.status === 'trialing') {
      const updated = await patchClientSub(sub, {
        ...(plan
          ? {
              plan_id: plan.id,
              price: plan.price,
              seat_price: plan.seatPrice,
              included_seats: plan.includedSeats,
            }
          : {}),
        seats,
      });
      await logClientSub(
        updated,
        'changed',
        { plan: plan?.name ?? null, seats, trial: true },
        actor.userId,
      );
      return {
        kind,
        invoiceId: null,
        message: 'The change was made.',
        subscription: toClientSubView(updated),
      };
    }
    const updated = await patchClientSub(sub, {
      pending_plan_id: plan?.id ?? null,
      pending_seats: seats,
    });
    await logClientSub(
      updated,
      'change_scheduled',
      { plan: plan?.name ?? null, seats },
      actor.userId,
    );
    await audit('change_scheduled', updated, { plan: plan?.name ?? null, seats });
    return {
      kind: kind === 'downgrade' ? 'downgrade' : 'same',
      invoiceId: null,
      message: `The change starts on ${endText}.`,
      subscription: toClientSubView(updated),
    };
  }

  const proration = prorate({
    oldAmount,
    newAmount,
    periodStart: new Date(sub.current_period_start),
    periodEnd: new Date(sub.current_period_end),
    at: now,
  });
  const updated = await patchClientSub(sub, {
    ...(plan
      ? {
          plan_id: plan.id,
          price: plan.price,
          seat_price: plan.seatPrice,
          included_seats: plan.includedSeats,
        }
      : {}),
    seats,
    pending_plan_id: null,
    pending_seats: null,
  });
  const invoiceId = await billUpgrade(
    updated,
    proration.net,
    `Upgrade for the ${proration.remainingDays} days left of this cycle`,
    now,
  );
  await logClientSub(
    updated,
    'upgraded',
    { plan: plan?.name ?? null, seats, invoiceId },
    actor.userId,
  );
  await audit('upgraded', updated, { plan: plan?.name ?? null, seats, invoiceId });
  return {
    kind: 'upgrade',
    invoiceId,
    message: 'The change is active now and the difference was invoiced.',
    subscription: toClientSubView(updated),
  };
}
