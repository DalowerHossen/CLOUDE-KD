// path: services/dispute/refund-requests.ts
// A client asks for a refund from the receipt page; the owner approves or denies; an approval is paid back through the
// payments service of STEP 10 (which keeps its own rules: the amount limit, the approval of large refunds, the idempotency
// key). Asking is refused when the refund window has passed, when more is asked than is left, when a request is already
// waiting, and when the payment is in dispute (the dispute is the way to settle it).
import 'server-only';
import { REFUND_WINDOW_DAYS } from '@/config/payment-risk';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { refundPayment } from '@/services/payment/refunds';
import { readRequestMeta } from '@/services/audit/request-meta';
import { recordPortalEvent, type PortalSubject } from '@/services/portal/events';
import type { Actor } from '@/types/contracts';

const DAY = 86_400_000;

export interface RefundOption {
  /** True when the client can ask now. */
  canRequest: boolean;
  /** What is left to refund, in USD. */
  refundable: string;
  /** Why the client cannot ask (shown instead of the form), or an empty text. */
  blockedReason: string;
  windowDays: number;
}

interface PaymentFacts {
  id: string;
  invoiceId: string;
  clientId: string | null;
  capturedAt: string | null;
  refundable: Money;
  status: string;
}

async function facts(companyId: string, paymentId: string): Promise<PaymentFacts> {
  const { data, error } = await getAdminSupabase()
    .from('payments')
    .select('id, invoice_id, client_id, captured_at, captured_amount, refunded_amount, status')
    .eq('id', paymentId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return {
    id: String(data.id),
    invoiceId: String(data.invoice_id),
    clientId: data.client_id ? String(data.client_id) : null,
    capturedAt: data.captured_at ? String(data.captured_at) : null,
    refundable: Money.parseRounded(String(data.captured_amount)).sub(
      Money.parseRounded(String(data.refunded_amount)),
    ),
    status: String(data.status),
  };
}

async function blocker(companyId: string, p: PaymentFacts): Promise<string> {
  if (!['captured', 'partially_refunded'].includes(p.status) || !p.capturedAt)
    return 'This payment cannot be refunded.';
  if (!p.refundable.isPositive()) return 'Nothing is left to refund on this payment.';
  if (Date.now() - Date.parse(p.capturedAt) > REFUND_WINDOW_DAYS * DAY)
    return `The refund period of ${REFUND_WINDOW_DAYS} days has passed.`;
  const admin = getAdminSupabase();
  const dispute = await admin
    .from('disputes')
    .select('id')
    .eq('company_id', companyId)
    .eq('payment_id', p.id)
    .in('status', ['new', 'gathering', 'submitted'])
    .is('deleted_at', null)
    .limit(1);
  if ((dispute.data ?? []).length > 0) return 'This payment is being reviewed with your bank.';
  const waiting = await admin
    .from('refund_requests')
    .select('id')
    .eq('company_id', companyId)
    .eq('payment_id', p.id)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .limit(1);
  if ((waiting.data ?? []).length > 0)
    return 'A refund request for this payment is already waiting.';
  return '';
}

export async function refundOption(companyId: string, paymentId: string): Promise<RefundOption> {
  const p = await facts(companyId, paymentId);
  const reason = await blocker(companyId, p);
  return {
    canRequest: reason === '',
    refundable: p.refundable.toDbString(),
    blockedReason: reason,
    windowDays: REFUND_WINDOW_DAYS,
  };
}

/** The client asks (receipt page). The address and device come from this request. */
export async function submitRefundRequest(
  subject: PortalSubject,
  input: { amount: string; reason: string },
): Promise<{ id: string }> {
  const p = await facts(subject.companyId, subject.docId);
  const reason = await blocker(subject.companyId, p);
  if (reason) throw new ValidationError(reason);
  const amount = Money.parseRounded(input.amount);
  if (!amount.isPositive()) throw new ValidationError('Enter an amount above zero.');
  if (amount.gt(p.refundable))
    throw new ValidationError('You cannot ask for more than what is left to refund.');
  const meta = await readRequestMeta();
  const { data, error } = await getAdminSupabase()
    .from('refund_requests')
    .insert({
      company_id: subject.companyId,
      payment_id: p.id,
      invoice_id: p.invoiceId,
      client_id: p.clientId,
      token_id: subject.tokenId,
      amount: amount.toDbString(),
      reason: input.reason,
      ip_hash: meta.ipHash,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505')
      throw new ValidationError('A refund request for this payment is already waiting.');
    throw new InternalError(error);
  }
  await recordPortalEvent(subject, 'refund_request');
  await getService('notification')
    .notify({
      companyId: subject.companyId,
      type: 'refund.requested',
      title: 'A client asks for a refund',
      body: `A refund of ${amount.toDbString()} USD was requested. Approve or deny it.`,
      href: '/disputes/refund-requests',
    })
    .catch(() => undefined);
  return { id: String(data.id) };
}

export interface RefundRequestView {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'processed' | 'failed';
  requestedAt: string;
  decidedAt: string | null;
  denyReason: string;
  failureNote: string;
}

function toView(r: Record<string, unknown>): RefundRequestView {
  return {
    id: String(r.id),
    paymentId: String(r.payment_id),
    invoiceId: String(r.invoice_id),
    amount: Money.parseRounded(String(r.amount)).toDbString(),
    reason: String(r.reason),
    status: String(r.status) as RefundRequestView['status'],
    requestedAt: String(r.created_at),
    decidedAt: r.decided_at ? String(r.decided_at) : null,
    denyReason: String(r.deny_reason ?? ''),
    failureNote: String(r.failure_note ?? ''),
  };
}

const COLUMNS =
  'id, payment_id, invoice_id, amount, reason, status, created_at, decided_at, deny_reason, failure_note';

export async function listRefundRequests(companyId: string): Promise<RefundRequestView[]> {
  const { data, error } = await getAdminSupabase()
    .from('refund_requests')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  return (data ?? []).map(toView);
}

/**
 * The owner decides. Approving takes the decision first (compare and set) and then pays back through the payments
 * service as this owner; if that fails the request is marked failed with the reason, and nothing is paid twice because
 * the refund key is built from the request.
 */
export async function decideRefundRequest(
  actor: Actor,
  id: string,
  decision: 'approve' | 'deny',
  reason: string,
): Promise<RefundRequestView> {
  if (!actor.companyId) throw new ForbiddenError();
  const companyId = actor.companyId;
  const admin = getAdminSupabase();
  const { data: row, error } = await admin
    .from('refund_requests')
    .select('id, payment_id, amount, status')
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!row) throw new NotFoundError();
  if (row.status !== 'pending') throw new ValidationError('This request was already decided.');
  const now = new Date().toISOString();
  const taken = await admin
    .from('refund_requests')
    .update(
      decision === 'approve'
        ? { status: 'approved', decided_by: actor.userId, decided_at: now }
        : { status: 'denied', decided_by: actor.userId, decided_at: now, deny_reason: reason },
    )
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (taken.error) throw new InternalError(taken.error);
  if (!taken.data || taken.data.length === 0)
    throw new ValidationError('This request was already decided.');
  if (decision === 'approve') {
    try {
      await refundPayment(
        String(row.payment_id),
        Money.parseRounded(String(row.amount)),
        'Client refund request',
        `refund-request-${id}`,
      );
      await admin.from('refund_requests').update({ status: 'processed' }).eq('id', id);
    } catch (thrown) {
      await admin
        .from('refund_requests')
        .update({
          status: 'failed',
          failure_note: 'The refund could not be made. Check the payment and refund it by hand.',
        })
        .eq('id', id);
      throw thrown;
    }
  }
  const { data: fresh } = await admin
    .from('refund_requests')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (!fresh) throw new NotFoundError();
  return toView(fresh);
}
