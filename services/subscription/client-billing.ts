// path: services/subscription/client-billing.ts
// The billing run of client subscriptions. For each cycle that is due, the cycle is claimed in the database first (so it
// is billed once, even when two jobs run together), the invoice is made and sent through the invoice service of STEP 09,
// and the subscription moves to its next period. A client pays the invoice through the normal payment link: automatic
// charging of a stored payment method waits for processor support (request R3). An invoice that stays unpaid gets three
// notices to the owner (the invoice service reminds the client), then a grace period, then the subscription ends.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError } from '@/lib/errors';
import { dueDateFor } from '@/lib/invoice/terms';
import { blankLine, EMPTY_BLOCK, termsFromDays } from '@/lib/invoice/form';
import type { InvoiceInput } from '@/lib/invoice/input';
import { createLogger } from '@/lib/logger';
import { cycleAmount, shiftAfterPause } from '@/lib/payment/client-subscription-rules';
import {
  addInterval,
  dunningStep,
  graceEndsAt,
  reminderDue,
} from '@/lib/payment/subscription-rules';
import { toInt } from '@/lib/reports/numbers';
import { type Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getClient } from '@/services/client/clients';
import { createInvoice } from '@/services/invoice/invoices';
import { loadFormData } from '@/services/invoice/form-data';
import { sendInvoice } from '@/services/invoice/send';
import type { Actor } from '@/types/contracts';
import { getClientPlan } from './client-plans';
import {
  CLIENT_SUB_COLUMNS,
  loadClientSub,
  logClientSub,
  patchClientSub,
  priced,
  type ClientSubRow,
} from './client-store';

const log = createLogger({ component: 'client-billing' });
const DAY = 86_400_000;

/** The actor a subscription works as: the owner who created it, so the invoice is sent without waiting for approval. */
export function systemActor(sub: Pick<ClientSubRow, 'company_id' | 'created_by'>): Actor {
  return {
    userId: sub.created_by ?? '00000000-0000-0000-0000-000000000000',
    role: 'owner',
    subRole: null,
    companyId: sub.company_id,
    email: '',
    sessionId: 'client-billing',
    impersonatedBy: null,
    authenticatedAt: new Date().toISOString(),
    lastStepUpAt: null,
    mfaVerified: true,
  };
}

async function invoiceInputFor(
  sub: ClientSubRow,
  description: string,
  amount: Money,
  today: string,
): Promise<InvoiceInput> {
  const [{ blank, defaultTaxCodes }, client] = await Promise.all([
    loadFormData(sub.company_id, today),
    getClient(sub.company_id, sub.client_id),
  ]);
  const terms = termsFromDays(client.paymentTermsDays);
  const line = {
    ...blankLine(defaultTaxCodes),
    description,
    quantity: '1',
    unit: 'cycle',
    unitPrice: amount.toDbString(),
  };
  return {
    ...blank,
    kind: 'invoice',
    clientId: client.id,
    billTo: {
      ...EMPTY_BLOCK,
      name: client.name,
      contactName: client.contactName,
      email: client.billingEmail ?? client.email ?? '',
      line1: client.billing.line1,
      line2: client.billing.line2,
      city: client.billing.city,
      region: client.billing.region,
      postalCode: client.billing.postalCode,
      country: client.billing.country,
    },
    issueDate: today,
    paymentTerms: terms,
    dueDate: dueDateFor(today, terms, null),
    lines: [line],
  };
}

export interface BillResult {
  outcome: 'invoiced' | 'ended' | 'skipped';
  invoiceId: string | null;
}

async function claimRun(
  sub: ClientSubRow,
  kind: 'cycle' | 'upgrade',
  start: Date,
  end: Date,
): Promise<{ id: string; invoiceId: string | null; status: string }> {
  const admin = getAdminSupabase();
  const inserted = await admin
    .from('client_billing_runs')
    .insert({
      company_id: sub.company_id,
      subscription_id: sub.id,
      kind,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
    })
    .select('id, invoice_id, status')
    .single();
  if (!inserted.error) return { id: String(inserted.data.id), invoiceId: null, status: 'claimed' };
  if (inserted.error.code !== '23505') throw new InternalError(inserted.error);
  const found = await admin
    .from('client_billing_runs')
    .select('id, invoice_id, status')
    .eq('subscription_id', sub.id)
    .eq('kind', kind)
    .eq('period_start', start.toISOString())
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error || !found.data)
    throw new InternalError(found.error ?? new Error('Billing run missing.'));
  return {
    id: String(found.data.id),
    invoiceId: found.data.invoice_id ? String(found.data.invoice_id) : null,
    status: String(found.data.status),
  };
}

async function finishRun(runId: string, invoiceId: string): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('client_billing_runs')
    .update({ status: 'invoiced', invoice_id: invoiceId, last_error: null })
    .eq('id', runId);
  if (error) throw new InternalError(error);
}

async function failRun(runId: string, message: string): Promise<void> {
  const admin = getAdminSupabase();
  const cur = await admin
    .from('client_billing_runs')
    .select('attempts')
    .eq('id', runId)
    .maybeSingle();
  await admin
    .from('client_billing_runs')
    .update({
      status: 'failed',
      attempts: (cur.data ? toInt(cur.data.attempts, 0) : 0) + 1,
      last_error: message.slice(0, 480),
    })
    .eq('id', runId);
}

/** Makes (or finds) the invoice of one run and sends it. */
async function invoiceForRun(
  sub: ClientSubRow,
  run: { id: string; invoiceId: string | null },
  description: string,
  amount: Money,
  today: string,
): Promise<string> {
  if (run.invoiceId) return run.invoiceId;
  const actor = systemActor(sub);
  const invoice = await createInvoice(
    actor,
    await invoiceInputFor(sub, description, amount, today),
  );
  await finishRun(run.id, invoice.id);
  try {
    await sendInvoice(actor, invoice.id, { confirmDuplicate: true, message: '' });
  } catch (error) {
    // The invoice exists; the owner can send it by hand. The run is not repeated.
    log.error('subscription invoice not sent', { subscriptionId: sub.id, error: String(error) });
  }
  return invoice.id;
}

/** Bills the cycle that is due for one subscription. Safe to run again for the same cycle. */
export async function billSubscription(
  companyId: string,
  subscriptionId: string,
  now: Date = new Date(),
): Promise<BillResult> {
  let sub = await loadClientSub(companyId, subscriptionId);
  if (
    !['trialing', 'active'].includes(sub.status) ||
    !sub.next_billing_at ||
    new Date(sub.next_billing_at) > now
  )
    return { outcome: 'skipped', invoiceId: null };
  const start = new Date(sub.next_billing_at);
  if (sub.cancel_at_period_end && new Date(sub.current_period_end) <= now) {
    sub = await patchClientSub(sub, {
      status: 'ended',
      ended_at: now.toISOString(),
      next_billing_at: null,
    });
    await logClientSub(sub, 'ended', { reason: sub.cancel_reason ?? 'Cancelled' }, null);
    return { outcome: 'ended', invoiceId: null };
  }
  // A change waiting for the end of the cycle starts with this cycle.
  let next = sub;
  if (sub.pending_plan_id || sub.pending_seats) {
    const plan = sub.pending_plan_id ? await getClientPlan(companyId, sub.pending_plan_id) : null;
    next = {
      ...sub,
      ...(plan
        ? {
            plan_id: plan.id,
            price: plan.price,
            seat_price: plan.seatPrice,
            included_seats: plan.includedSeats,
            interval: plan.interval,
          }
        : {}),
      seats: sub.pending_seats ?? sub.seats,
    };
  }
  const end = addInterval(start, next.interval);
  const run = await claimRun(next, 'cycle', start, end);
  const plan = await getClientPlan(companyId, next.plan_id);
  const amount = cycleAmount(priced(next));
  const description = `${plan.name} subscription, ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
  try {
    const invoiceId = await invoiceForRun(
      next,
      run,
      description,
      amount,
      now.toISOString().slice(0, 10),
    );
    const updated = await patchClientSub(sub, {
      plan_id: next.plan_id,
      price: next.price,
      seat_price: next.seat_price,
      included_seats: next.included_seats,
      interval: next.interval,
      seats: next.seats,
      pending_plan_id: null,
      pending_seats: null,
      status: 'active',
      trial_ends_at: null,
      current_period_start: start.toISOString(),
      current_period_end: end.toISOString(),
      next_billing_at: end.toISOString(),
    });
    await logClientSub(
      updated,
      'billed',
      { invoiceId, until: end.toISOString().slice(0, 10) },
      null,
    );
    await getService('events')
      .publish({
        name: 'subscription.renewed',
        companyId,
        payload: { clientSubscriptionId: updated.id, invoiceId },
      })
      .catch(() => undefined);
    return { outcome: 'invoiced', invoiceId };
  } catch (thrown) {
    await failRun(run.id, thrown instanceof Error ? thrown.message : 'Unknown error');
    throw thrown;
  }
}

/** The upgrade invoice (prorated by the day) for a plan or seat change in the middle of a cycle. */
export async function billUpgrade(
  sub: ClientSubRow,
  amount: Money,
  label: string,
  now: Date = new Date(),
): Promise<string | null> {
  if (!amount.isPositive()) return null;
  const run = await claimRun(sub, 'upgrade', now, new Date(sub.current_period_end));
  try {
    return await invoiceForRun(sub, run, label, amount, now.toISOString().slice(0, 10));
  } catch (thrown) {
    await failRun(run.id, thrown instanceof Error ? thrown.message : 'Unknown error');
    throw thrown;
  }
}

/* ---------------------------------------------------------------- unpaid invoices */

async function latestCycleInvoice(
  sub: ClientSubRow,
): Promise<{ id: string; status: string; dueDate: string; number: string } | null> {
  const admin = getAdminSupabase();
  const run = await admin
    .from('client_billing_runs')
    .select('invoice_id')
    .eq('subscription_id', sub.id)
    .eq('kind', 'cycle')
    .eq('status', 'invoiced')
    .is('deleted_at', null)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (run.error) throw new InternalError(run.error);
  if (!run.data?.invoice_id) return null;
  const inv = await admin
    .from('invoices')
    .select('id, status, due_date, number')
    .eq('id', run.data.invoice_id)
    .maybeSingle();
  if (inv.error) throw new InternalError(inv.error);
  return inv.data
    ? {
        id: String(inv.data.id),
        status: String(inv.data.status),
        dueDate: String(inv.data.due_date),
        number: String(inv.data.number ?? ''),
      }
    : null;
}

const OPEN = ['sent', 'viewed', 'partially_paid', 'overdue'];

async function tellOwner(
  sub: ClientSubRow,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    await getService('notification').notify({
      companyId: sub.company_id,
      type,
      title,
      body,
      href: `/subscriptions/${sub.id}`,
    });
  } catch (error) {
    log.error('owner notice not sent', { subscriptionId: sub.id, error: String(error) });
  }
}

/** Three notices to the owner for an unpaid invoice, then a grace period, then the end of the subscription. */
async function checkUnpaid(sub: ClientSubRow, now: Date): Promise<'ok' | 'notice' | 'ended'> {
  const invoice = await latestCycleInvoice(sub);
  if (!invoice) return 'ok';
  if (invoice.status === 'paid') {
    if (sub.status === 'past_due') {
      const back = await patchClientSub(sub, {
        status: 'active',
        failed_attempts: 0,
        next_attempt_at: null,
        grace_ends_at: null,
      });
      await logClientSub(back, 'payment_received', { invoice: invoice.number }, null);
    }
    return 'ok';
  }
  if (!OPEN.includes(invoice.status)) return 'ok';
  const step = dunningStep({
    dueAt: new Date(`${invoice.dueDate}T00:00:00Z`),
    attemptsMade: sub.failed_attempts,
    now,
    graceEndsAt: sub.grace_ends_at ? new Date(sub.grace_ends_at) : null,
  });
  if (step.kind === 'wait') return 'ok';
  if (step.kind === 'grace_end') {
    const ended = await patchClientSub(sub, {
      status: 'ended',
      ended_at: now.toISOString(),
      next_billing_at: null,
      next_attempt_at: null,
      grace_ends_at: null,
      cancel_reason: 'Not paid',
    });
    await logClientSub(ended, 'ended', { reason: 'Not paid', invoice: invoice.number }, null);
    await tellOwner(
      sub,
      'client_subscription.ended',
      'A client subscription ended',
      `The subscription ended because invoice ${invoice.number} was not paid.`,
    );
    return 'ended';
  }
  const grace = step.last ? graceEndsAt(now) : null;
  const updated = await patchClientSub(sub, {
    status: 'past_due',
    failed_attempts: step.number,
    next_attempt_at: step.nextAt?.toISOString() ?? null,
    ...(grace ? { grace_ends_at: grace.toISOString() } : {}),
  });
  await logClientSub(
    updated,
    'payment_notice',
    { number: step.number, invoice: invoice.number },
    null,
  );
  await tellOwner(
    sub,
    'client_subscription.unpaid',
    'A client has not paid',
    `Invoice ${invoice.number} is unpaid (notice ${step.number} of 3).${grace ? ` The subscription ends on ${grace.toISOString().slice(0, 10)} if it stays unpaid.` : ''}`,
  );
  return 'notice';
}

/* ---------------------------------------------------------------- the job */

export interface ClientRunResult {
  billed: number;
  ended: number;
  resumed: number;
  notices: number;
  reminders: number;
}

/** Resumes paused subscriptions, bills the cycles that are due, checks unpaid invoices and sends renewal reminders. */
export async function runClientBilling(now: Date = new Date()): Promise<ClientRunResult> {
  const admin = getAdminSupabase();
  const result: ClientRunResult = { billed: 0, ended: 0, resumed: 0, notices: 0, reminders: 0 };

  const paused = await admin
    .from('client_subscriptions')
    .select(CLIENT_SUB_COLUMNS)
    .eq('status', 'paused')
    .not('pause_resumes_at', 'is', null)
    .lte('pause_resumes_at', now.toISOString())
    .is('deleted_at', null)
    .limit(300);
  if (paused.error) throw new InternalError(paused.error);
  for (const sub of (paused.data ?? []) as unknown as ClientSubRow[]) {
    try {
      await resumeRow(sub, now, null);
      result.resumed += 1;
    } catch (thrown) {
      log.error('resume failed', { subscriptionId: sub.id, error: String(thrown) });
    }
  }

  const due = await admin
    .from('client_subscriptions')
    .select(CLIENT_SUB_COLUMNS)
    .in('status', ['trialing', 'active'])
    .lte('next_billing_at', now.toISOString())
    .is('deleted_at', null)
    .order('next_billing_at')
    .limit(300);
  if (due.error) throw new InternalError(due.error);
  for (const sub of (due.data ?? []) as unknown as ClientSubRow[]) {
    try {
      const done = await billSubscription(sub.company_id, sub.id, now);
      if (done.outcome === 'invoiced') result.billed += 1;
      if (done.outcome === 'ended') result.ended += 1;
    } catch (thrown) {
      log.error('cycle not billed', { subscriptionId: sub.id, error: String(thrown) });
    }
  }

  const watch = await admin
    .from('client_subscriptions')
    .select(CLIENT_SUB_COLUMNS)
    .in('status', ['active', 'past_due'])
    .is('deleted_at', null)
    .limit(500);
  if (watch.error) throw new InternalError(watch.error);
  for (const sub of (watch.data ?? []) as unknown as ClientSubRow[]) {
    try {
      const outcome = await checkUnpaid(sub, now);
      if (outcome === 'notice') result.notices += 1;
      if (outcome === 'ended') result.ended += 1;
      if (outcome === 'ok' && sub.status === 'active')
        result.reminders += await renewalReminder(sub, now);
    } catch (thrown) {
      log.error('unpaid check failed', { subscriptionId: sub.id, error: String(thrown) });
    }
  }
  return result;
}

/** Tells the owner a day count before a renewal (7, 3 and 1 days), each once; the client gets the invoice itself. */
async function renewalReminder(sub: ClientSubRow, now: Date): Promise<number> {
  if (sub.cancel_at_period_end) return 0;
  const end = new Date(sub.current_period_end);
  const tag = end.toISOString().slice(0, 10);
  const seen = await getAdminSupabase()
    .from('client_subscription_events')
    .select('event')
    .eq('subscription_id', sub.id)
    .like('event', `reminder_%:${tag}`);
  if (seen.error) throw new InternalError(seen.error);
  const sent = new Set(
    (seen.data ?? [])
      .map((r) => toInt(String(r.event).slice('reminder_'.length).split(':')[0], 0))
      .filter((n) => n > 0),
  );
  const day = reminderDue(end, now, sent);
  if (day === null) return 0;
  await logClientSub(sub, `reminder_${day}:${tag}`, {}, null);
  await tellOwner(
    sub,
    'client_subscription.renewal',
    'A client subscription renews soon',
    `A subscription renews in ${day} day(s), on ${tag}.`,
  );
  return 1;
}

/* ---------------------------------------------------------------- resume (shared with the owner action) */

export async function resumeRow(
  sub: ClientSubRow,
  now: Date,
  actorId: string | null,
): Promise<ClientSubRow> {
  if (sub.status !== 'paused' || !sub.paused_at)
    throw new ConflictError('The subscription is not paused.');
  const shifted = sub.next_billing_at
    ? shiftAfterPause(new Date(sub.next_billing_at), new Date(sub.paused_at), now)
    : null;
  const inTrial = sub.trial_ends_at !== null && new Date(sub.trial_ends_at) > now;
  const gap = now.getTime() - new Date(sub.paused_at).getTime();
  const updated = await patchClientSub(sub, {
    status: inTrial ? 'trialing' : 'active',
    paused_at: null,
    pause_resumes_at: null,
    next_billing_at: shifted?.toISOString() ?? null,
    current_period_end: new Date(
      new Date(sub.current_period_end).getTime() + (gap > 0 ? gap : 0),
    ).toISOString(),
    ...(sub.trial_ends_at
      ? {
          trial_ends_at: new Date(
            new Date(sub.trial_ends_at).getTime() + (gap > 0 ? gap : 0),
          ).toISOString(),
        }
      : {}),
  });
  await logClientSub(updated, 'resumed', { days: toInt(gap / DAY, 0) }, actorId);
  return updated;
}
