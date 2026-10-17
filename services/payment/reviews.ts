// path: services/payment/reviews.ts
// Review queue (REQ-VERIFY item 2): list, decisions, expiry of the hold, and the blocked card list.
import { getService } from '@/lib/container';
import { ConflictError, ForbiddenError, InternalError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { Actor, PaymentSummary } from '@/types/contracts';
import { blockIdentity } from './card-identities';
import { auditPayment } from './payment-events';
import { captureHeld, voidAuthorized } from './payments';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRow } from './payment-store';

export interface ReviewPaymentListItem {
  id: string;
  invoiceId: string;
  companyId: string;
  amount: string;
  createdAt: string;
}

/** Payments waiting for a manual review. A company sees its own; platform roles see all. */
export async function listReviewPayments(
  companyId: string | null,
): Promise<ReviewPaymentListItem[]> {
  let query = getAdminSupabase()
    .from('payments')
    .select('id, invoice_id, company_id, amount, created_at')
    .eq('status', 'pending_review')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(200);
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    invoiceId: String(r.invoice_id),
    companyId: String(r.company_id),
    amount: String(r.amount),
    createdAt: String(r.created_at),
  }));
}

export interface ReviewItem {
  reviewId: string;
  paymentId: string;
  companyId: string;
  companyName: string;
  invoiceNumber: string;
  amount: string;
  processorId: string | null;
  reasons: string[];
  holdUntil: string;
  createdAt: string;
  payerCountry: string | null;
  cardIdentityId: string | null;
}

/** The open review queue for platform reviewers, oldest first. */
export async function listReviewQueue(): Promise<ReviewItem[]> {
  const db = getAdminSupabase();
  const { data, error } = await db
    .from('payment_reviews')
    .select('id, company_id, payment_id, reasons, hold_until, created_at')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new InternalError(error);
  const reviews = data ?? [];
  if (reviews.length === 0) return [];
  const paymentIds = reviews.map((r) => String(r.payment_id));
  const companyIds = [...new Set(reviews.map((r) => String(r.company_id)))];
  const [payments, companies] = await Promise.all([
    db
      .from('payments')
      .select('id, company_id, invoice_id, amount, processor_id, payer_country, card_identity_id')
      .in('id', paymentIds),
    db.from('companies').select('id, name').in('id', companyIds),
  ]);
  if (payments.error) throw new InternalError(payments.error);
  if (companies.error) throw new InternalError(companies.error);
  const invoiceIds = (payments.data ?? []).map((p) => String(p.invoice_id));
  const invoices = await db.from('invoices').select('id, number').in('id', invoiceIds);
  if (invoices.error) throw new InternalError(invoices.error);
  const pay = new Map((payments.data ?? []).map((p) => [String(p.id), p]));
  const co = new Map((companies.data ?? []).map((c) => [String(c.id), String(c.name)]));
  const inv = new Map((invoices.data ?? []).map((i) => [String(i.id), String(i.number ?? '')]));
  return reviews.flatMap((r) => {
    const p = pay.get(String(r.payment_id));
    if (!p) return [];
    return [
      {
        reviewId: String(r.id),
        paymentId: String(r.payment_id),
        companyId: String(r.company_id),
        companyName: co.get(String(r.company_id)) ?? '',
        invoiceNumber: inv.get(String(p.invoice_id)) ?? '',
        amount: String(p.amount),
        processorId: p.processor_id ? String(p.processor_id) : null,
        reasons: (r.reasons ?? []) as string[],
        holdUntil: String(r.hold_until),
        createdAt: String(r.created_at),
        payerCountry: p.payer_country ? String(p.payer_country) : null,
        cardIdentityId: p.card_identity_id ? String(p.card_identity_id) : null,
      },
    ];
  });
}

async function canDecide(actor: Actor): Promise<boolean> {
  const permissions = getService('permissions');
  return (
    (await permissions.can(actor, 'payment.review.decide', { type: 'payment_review' })) ||
    (await permissions.can(actor, 'fraud.payment_review.decide', { type: 'payment_review' }))
  );
}

async function markReview(
  reviewId: string,
  companyId: string,
  status: 'captured' | 'voided' | 'expired',
  actorId: string | null,
  note: string | null,
): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('payment_reviews')
    .update({
      status,
      decided_by: actorId,
      decided_at: new Date().toISOString(),
      decision_note: note ? note.slice(0, 300) : null,
    })
    .eq('company_id', companyId)
    .eq('id', reviewId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new ConflictError('This review was already decided.');
}

/** A reviewer captures or voids a held payment. Both are audit logged with the reviewer and the note. */
export async function decideReview(
  actor: Actor,
  reviewId: string,
  input: { decision: 'capture' | 'void'; note: string | null; blockCard: boolean },
): Promise<PaymentSummary> {
  if (!(await canDecide(actor))) throw new ForbiddenError();
  const { data, error } = await getAdminSupabase()
    .from('payment_reviews')
    .select('id, company_id, payment_id, status')
    .eq('id', reviewId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  if (data.status !== 'pending') throw new ConflictError('This review was already decided.');
  const companyId = String(data.company_id);
  const row = await getRow(companyId, String(data.payment_id));
  if (row.status !== 'pending_review')
    throw new ConflictError('The payment is no longer waiting for review.');

  let outcome: PaymentSummary;
  if (input.decision === 'capture') {
    outcome = await captureHeld(row);
    await markReview(reviewId, companyId, 'captured', actor.userId, input.note);
  } else {
    outcome = await voidAuthorized(row, 'review_voided');
    await markReview(reviewId, companyId, 'voided', actor.userId, input.note);
    if (input.blockCard && row.card_identity_id) {
      await blockIdentity(
        actor,
        row.card_identity_id,
        input.note ?? 'Blocked by a payment reviewer',
      );
    }
  }
  await auditPayment(
    input.decision === 'capture' ? 'payment.review.capture' : 'payment.review.void',
    row,
    {
      reviewId,
      note: input.note,
      blockedCard: input.decision === 'void' && input.blockCard,
    },
  );
  return outcome;
}

/** Voids the authorization of reviews whose hold ran out. Run by the cron job. */
export async function expireReviews(limit: number): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('payment_reviews')
    .select('id, company_id, payment_id')
    .eq('status', 'pending')
    .lt('hold_until', new Date().toISOString())
    .is('deleted_at', null)
    .order('hold_until', { ascending: true })
    .limit(limit);
  if (error) throw new InternalError(error);
  let expired = 0;
  for (const r of data ?? []) {
    const companyId = String(r.company_id);
    try {
      const row = await getRow(companyId, String(r.payment_id));
      if (row.status === 'pending_review') await voidAuthorized(row, 'review_expired');
      await markReview(String(r.id), companyId, 'expired', null, 'The review hold ran out.');
      await auditPayment('payment.review.expired', row, { reviewId: String(r.id) });
      expired += 1;
    } catch (e) {
      logger.error('review not expired', { reviewId: String(r.id), error: String(e) });
    }
  }
  return expired;
}

export interface BlockedCard {
  id: string;
  processorId: string;
  reason: string;
  source: string;
  createdAt: string;
  expiresAt: string | null;
}

export async function listBlockedCards(): Promise<BlockedCard[]> {
  const { data, error } = await getAdminSupabase()
    .from('card_blacklist')
    .select('id, processor_id, reason, source, created_at, expires_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  return (data ?? [])
    .filter((c) => c.expires_at === null || new Date(String(c.expires_at)).getTime() > Date.now())
    .map((c) => ({
      id: String(c.id),
      processorId: String(c.processor_id),
      reason: String(c.reason),
      source: String(c.source),
      createdAt: String(c.created_at),
      expiresAt: c.expires_at ? String(c.expires_at) : null,
    }));
}

/** Takes a card off the blocked list (the row stays as history; it expires now). */
export async function unblockCard(actor: Actor, id: string): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('card_blacklist')
    .update({ expires_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  await getService('audit').record({
    action: 'card.unblock',
    resourceType: 'card_blacklist',
    resourceId: id,
    metadata: { by: actor.userId },
  });
}

/** Review pages and lists are open to the payment processors and the fraud analysts (and the roles above them). */
export async function canReadReviews(actor: Actor): Promise<boolean> {
  const permissions = getService('permissions');
  return (
    (await permissions.can(actor, 'payment.review.read', { type: 'payment_review' })) ||
    (await permissions.can(actor, 'fraud.payment_review.read', { type: 'payment_review' }))
  );
}
