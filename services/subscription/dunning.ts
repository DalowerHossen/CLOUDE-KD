// path: services/subscription/dunning.ts
// An unpaid renewal: three attempts (the day it is due, three days later, seven days later), each with a notice to the
// owners, then the grace period, then the move to the free plan. Data is never deleted. Charging a stored card by
// itself needs a processor operation that the adapter contract does not have yet (request R3), so an attempt today is
// the notice and the retry of the invoice page; `chargeStoredMethod` is where the processor call will go.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { dunningStep, graceEndsAt } from '@/lib/payment/subscription-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPlatformInvoice, setVoid, type PlatformInvoiceView } from './invoices';
import { mailOwners } from '@/services/wallet/owner-mail';
import {
  endSubscription,
  getSubRow,
  logEvent,
  patchSub,
  SUB_COLUMNS,
  type SubRow,
} from './platform';
import { loadBilling } from './settings';

const log = createLogger({ component: 'dunning' });

export type ChargeOutcome = 'unsupported' | 'paid' | 'declined';

/** Where a charge of a stored payment method will be made once the adapters support it (R3). */
export async function chargeStoredMethod(_invoice: PlatformInvoiceView): Promise<ChargeOutcome> {
  return 'unsupported';
}

async function openRenewal(sub: SubRow): Promise<PlatformInvoiceView | null> {
  const { data, error } = await getAdminSupabase()
    .from('platform_invoices')
    .select('id')
    .eq('subscription_id', sub.id)
    .eq('kind', 'subscription')
    .eq('status', 'open')
    .is('deleted_at', null)
    .order('issued_at', { ascending: false })
    .limit(1);
  if (error) throw new InternalError(error);
  const id = data?.[0]?.id;
  return id ? getPlatformInvoice(String(id), null) : null;
}

export interface DunningResult {
  attempts: number;
  graceStarted: number;
  ended: number;
  abandoned: number;
}

/** Runs the attempts that are due and the moves after them. Safe to run again: each step is guarded by the saved state. */
export async function runDunning(now: Date = new Date()): Promise<DunningResult> {
  const result: DunningResult = { attempts: 0, graceStarted: 0, ended: 0, abandoned: 0 };
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('platform_subscriptions')
    .select(SUB_COLUMNS)
    .in('status', ['past_due', 'grace', 'incomplete'])
    .is('deleted_at', null)
    .order('current_period_end')
    .limit(500);
  if (error) throw new InternalError(error);
  const billing = await loadBilling();
  for (const sub of (data ?? []) as SubRow[]) {
    try {
      const invoice = await openRenewal(sub);
      if (sub.status === 'incomplete') {
        // The first invoice was never paid: it is cancelled and the subscription is dropped without touching the plan.
        if (invoice && new Date(invoice.dueAt) <= now) {
          await setVoid(invoice.id, 'void');
          await patchSub(sub, { status: 'ended', ended_at: now.toISOString() });
          await logEvent(sub, 'abandoned', { invoice: invoice.number }, null);
          result.abandoned += 1;
        }
        continue;
      }
      if (!invoice) continue;
      const step = dunningStep({
        dueAt: new Date(invoice.dueAt),
        attemptsMade: sub.dunning_attempts,
        now,
        graceEndsAt: sub.grace_ends_at ? new Date(sub.grace_ends_at) : null,
      });
      if (step.kind === 'wait') continue;
      if (step.kind === 'grace_end') {
        await endSubscription(sub, 'Payment was not received', 'unpaid', null);
        result.ended += 1;
        continue;
      }
      const charge = await chargeStoredMethod(invoice);
      if (charge === 'paid') continue;
      const grace = step.last ? graceEndsAt(now, billing.graceDays) : null;
      const updated = await patchSub(sub, {
        status: step.last ? 'grace' : 'past_due',
        dunning_attempts: step.number,
        next_dunning_at: step.nextAt?.toISOString() ?? null,
        ...(grace ? { grace_ends_at: grace.toISOString() } : {}),
      });
      await logEvent(
        updated,
        'payment_attempt',
        { number: step.number, charge, invoice: invoice.number },
        null,
      );
      await mailOwners(
        sub.company_id,
        'billing.payment-failed',
        {
          companyName: invoice.buyerName,
          number: invoice.number,
          total: `${invoice.total} USD`,
          attempt: String(step.number),
          graceEnds: grace ? grace.toISOString().slice(0, 10) : '',
          link: `/subscriptions/billing/invoices/${invoice.id}`,
        },
        `dunning:${invoice.id}:${step.number}`,
      );
      result.attempts += 1;
      if (step.last) result.graceStarted += 1;
    } catch (thrown) {
      log.error('dunning step failed', { subscriptionId: sub.id, error: String(thrown) });
    }
  }
  result.abandoned += await dropUnpaidUpgrades(now);
  return result;
}

/** An upgrade invoice that stays unpaid is cancelled; the company simply stays on its plan. */
async function dropUnpaidUpgrades(now: Date): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('platform_invoices')
    .select('id, company_id')
    .eq('kind', 'upgrade')
    .eq('status', 'open')
    .lt('due_at', now.toISOString())
    .is('deleted_at', null)
    .limit(200);
  if (error) throw new InternalError(error);
  let dropped = 0;
  for (const inv of data ?? []) {
    if (!(await setVoid(String(inv.id), 'void'))) continue;
    const sub = await getSubRow(String(inv.company_id));
    if (sub && sub.pending_kind === 'on_payment')
      await patchSub(sub, { pending_plan_slug: null, pending_interval: null, pending_kind: null });
    dropped += 1;
  }
  return dropped;
}
