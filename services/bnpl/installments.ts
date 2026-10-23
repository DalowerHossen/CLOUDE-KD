// path: services/bnpl/installments.ts
// A client takes installments for an invoice. The parts are the installment plan of the invoice (STEP 09), so each payment
// the client makes covers the oldest unpaid part. The plan row keeps the offer that was accepted and the fee the seller
// pays. A plan check marks the plan completed when every part is paid and defaulted when too many parts are late.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, ForbiddenError, InternalError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { planOutcome } from '@/lib/payment/bnpl-rules';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import { getInvoice } from '@/services/invoice/invoices';
import { listInstallments, removePlan, savePlan } from '@/services/invoice/installments';
import type { Actor } from '@/types/contracts';
import { offersForInvoice } from './offers';
import { getBnplPartner } from './partners';
import { loadBnplRules } from './settings';

const log = createLogger({ component: 'bnpl' });
const CONSENT =
  'The client agrees to pay the invoice in equal monthly parts on the dates shown, and that a late part can end the plan.';

export interface BnplPlanView {
  id: string;
  invoiceId: string;
  clientId: string | null;
  partner: string;
  terms: number;
  principal: string;
  sellerFeePercent: string;
  sellerFee: string;
  status: string;
  missedCount: number;
  createdAt: string;
}

const COLUMNS =
  'id, invoice_id, client_id, partner, terms, principal, seller_fee_percent, seller_fee, status, missed_count, created_at';

interface PlanRow {
  id: string;
  invoice_id: string;
  client_id: string | null;
  partner: string;
  terms: number;
  principal: string | number;
  seller_fee_percent: string | number;
  seller_fee: string | number;
  status: string;
  missed_count: number;
  created_at: string;
}

function view(r: PlanRow): BnplPlanView {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    clientId: r.client_id,
    partner: r.partner,
    terms: toInt(r.terms),
    principal: String(r.principal),
    sellerFeePercent: String(r.seller_fee_percent),
    sellerFee: String(r.seller_fee),
    status: r.status,
    missedCount: toInt(r.missed_count),
    createdAt: r.created_at,
  };
}

async function logPlan(
  companyId: string,
  planId: string,
  event: string,
  detail: Record<string, unknown>,
  actorId: string | null,
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('bnpl_events')
    .insert({ company_id: companyId, plan_id: planId, event, detail, actor_id: actorId });
  if (error) log.error('plan event not written', { planId, error: error.message });
}

async function tellOwner(
  companyId: string,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    await getService('notification').notify({ companyId, type, title, body, href: '/wallet/bnpl' });
  } catch (error) {
    log.error('owner notice not sent', { companyId, error: String(error) });
  }
}

export async function listPlans(companyId: string, status?: string): Promise<BnplPlanView[]> {
  let q = getAdminSupabase()
    .from('bnpl_plans')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as PlanRow[]).map(view);
}

/** The owner accepts an offer for a client (or the client accepts through a payment link, with `by: client`). */
export async function acceptOffer(
  actor: Actor,
  invoiceId: string,
  terms: number,
  by: 'owner' | 'client' = 'owner',
): Promise<BnplPlanView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ForbiddenError();
  const answer = await offersForInvoice(companyId, invoiceId);
  if (!answer.eligible)
    throw new ValidationError(
      answer.reasons[0] ?? 'Installments are not offered for this invoice.',
    );
  const offer = answer.offers.find((o) => o.terms === terms);
  if (!offer) throw new ValidationError('That number of parts is not offered for this invoice.');
  const invoice = await getInvoice(companyId, invoiceId);
  const admin = getAdminSupabase();
  const inserted = await admin
    .from('bnpl_plans')
    .insert({
      company_id: companyId,
      invoice_id: invoiceId,
      client_id: invoice.clientId,
      partner: answer.partner,
      terms: offer.terms,
      principal: offer.clientTotal,
      seller_fee_percent: offer.sellerFeePercent,
      seller_fee: offer.sellerFee,
      consent_text: CONSENT,
      accepted_by: by,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (inserted.error) {
    if (inserted.error.code === '23505')
      throw new ConflictError('The invoice already has an installment plan.');
    throw new InternalError(inserted.error);
  }
  const row = inserted.data as unknown as PlanRow;
  try {
    const first = offer.rows[0];
    await savePlan(actor, invoiceId, {
      mode: 'even',
      count: offer.terms,
      firstDue: first ? first.dueDate : new Date().toISOString().slice(0, 10),
      unit: 'month',
      every: 1,
      downPaymentPercent: '0',
    });
    await getBnplPartner(answer.partner)?.onAccepted({ planId: row.id, invoiceId, offer });
  } catch (error) {
    await admin
      .from('bnpl_plans')
      .update({ status: 'cancelled', deleted_at: new Date().toISOString() })
      .eq('id', row.id);
    throw error;
  }
  await logPlan(
    companyId,
    row.id,
    'accepted',
    { terms: offer.terms, by, fee: offer.sellerFee },
    actor.userId,
  );
  await getService('audit').record({
    action: 'bnpl.plan_accepted',
    resourceType: 'bnpl_plan',
    resourceId: row.id,
    companyId,
    metadata: { invoiceId, terms: offer.terms, by },
  });
  await tellOwner(
    companyId,
    'bnpl.accepted',
    'Installment plan started',
    `A client will pay an invoice in ${offer.terms} parts.`,
  );
  return view(row);
}

/** Cancels a plan that has no payment yet: the parts are removed and the invoice is a normal invoice again. */
export async function cancelPlan(actor: Actor, planId: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ForbiddenError();
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('bnpl_plans')
    .select(COLUMNS)
    .eq('id', planId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  const plan = data as unknown as PlanRow | null;
  if (!plan) throw new ValidationError('The plan was not found.');
  if (plan.status !== 'active') throw new ConflictError('Only a running plan can be cancelled.');
  const invoice = await getInvoice(companyId, plan.invoice_id);
  if (Money.parse(invoice.amountPaid).isPositive())
    throw new ConflictError('A plan with a payment cannot be cancelled.');
  const done = await admin
    .from('bnpl_plans')
    .update({ status: 'cancelled', deleted_at: new Date().toISOString() })
    .eq('id', planId)
    .eq('status', 'active');
  if (done.error) throw new InternalError(done.error);
  await removePlan(actor, plan.invoice_id);
  await logPlan(companyId, planId, 'cancelled', {}, actor.userId);
  await getService('audit').record({
    action: 'bnpl.plan_cancelled',
    resourceType: 'bnpl_plan',
    resourceId: planId,
    companyId,
    metadata: { invoiceId: plan.invoice_id },
  });
}

/** Looks at every running plan: completed when all parts are paid, defaulted when too many parts are late. */
export async function checkPlans(
  now: Date = new Date(),
): Promise<{ checked: number; completed: number; defaulted: number }> {
  const today = now.toISOString().slice(0, 10);
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('bnpl_plans')
    .select(`${COLUMNS}, company_id`)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(2000);
  if (error) throw new InternalError(error);
  const out = { checked: 0, completed: 0, defaulted: 0 };
  for (const raw of (data ?? []) as unknown as (PlanRow & { company_id: string })[]) {
    try {
      out.checked += 1;
      const rules = await loadBnplRules(raw.company_id);
      const statuses = await listInstallments(raw.company_id, raw.invoice_id);
      const result = planOutcome({
        statuses,
        today,
        graceDays: rules.graceDays,
        missedLimit: rules.missedLimit,
      });
      const patch: Record<string, unknown> = { missed_count: Math.min(result.missed, 24) };
      if (result.outcome === 'completed') {
        patch.status = 'completed';
        patch.completed_at = now.toISOString();
      } else if (result.outcome === 'defaulted') patch.status = 'defaulted';
      const changed = result.outcome !== 'active' || result.missed !== toInt(raw.missed_count);
      if (!changed) continue;
      const done = await admin
        .from('bnpl_plans')
        .update(patch)
        .eq('id', raw.id)
        .eq('status', 'active');
      if (done.error) throw new InternalError(done.error);
      if (result.outcome === 'completed') {
        out.completed += 1;
        await logPlan(raw.company_id, raw.id, 'completed', {}, null);
        await tellOwner(
          raw.company_id,
          'bnpl.completed',
          'Installment plan paid',
          'A client paid every part of an installment plan.',
        );
      } else if (result.outcome === 'defaulted') {
        out.defaulted += 1;
        await logPlan(raw.company_id, raw.id, 'defaulted', { missed: result.missed }, null);
        await getService('audit').record({
          action: 'bnpl.plan_defaulted',
          resourceType: 'bnpl_plan',
          resourceId: raw.id,
          companyId: raw.company_id,
          metadata: { missed: result.missed },
        });
        await tellOwner(
          raw.company_id,
          'bnpl.defaulted',
          'Installment plan in default',
          `${result.missed} parts are late. Follow up with the client.`,
        );
      } else {
        await logPlan(raw.company_id, raw.id, 'part_late', { missed: result.missed }, null);
      }
    } catch (e) {
      log.error('plan check failed', { planId: raw.id, error: String(e) });
    }
  }
  return out;
}

/** A refund on an invoice with a plan is written to the plan history; the seller decides about the remaining parts. */
export async function recordRefund(invoiceId: string, amount: string): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('bnpl_plans')
    .select('id, company_id, partner')
    .eq('invoice_id', invoiceId)
    .in('status', ['active', 'completed'])
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return;
  await getBnplPartner(String(data.partner))?.onRefund({
    planId: String(data.id),
    invoiceId,
    amount,
  });
  await logPlan(String(data.company_id), String(data.id), 'refund', { amount }, null);
}
