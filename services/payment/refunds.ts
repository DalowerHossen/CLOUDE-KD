// path: services/payment/refunds.ts
// Refunds: policy (window, remaining amount, processor support), approval for staff and for large amounts, then the
// processor call. The invoice contract has no "reverse a payment" call yet, so a refund does not change the invoice
// (DECISIONS D7, DEPENDENCY_REQUESTS); accounting is fed by the `payment.refunded` event.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  IdempotencyConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getContext } from '@/lib/logger/correlation';
import { REFUND_APPROVAL_THRESHOLD_USD, REFUND_WINDOW_DAYS } from '@/config/payment-risk';
import { requireRefund } from '@/lib/payment/capabilities';
import { defaultMode } from '@/lib/payment/modes';
import { loadAdapter } from '@/lib/payment/registry';
import { refundable, statusAfterRefund } from '@/lib/payment/state-machine';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, PaymentSummary } from '@/types/contracts';
import { resolveCredentials } from './company-accounts';
import { loadCurrentCredentials } from './credential-store';
import { auditPayment, publishPaymentEvent } from './payment-events';
import {
  addAttempt,
  getRow,
  money,
  patchPayment,
  toSummary,
  transition,
  type PaymentRow,
} from './payment-store';

const REFUND_COLUMNS =
  'id, company_id, payment_id, invoice_id, amount, reason, status, idempotency_key, approval_request_id, processor_refund_id, requested_by, version';

export interface RefundRow {
  id: string;
  company_id: string;
  payment_id: string;
  invoice_id: string;
  amount: string;
  reason: string | null;
  status: 'requested' | 'pending_approval' | 'processing' | 'succeeded' | 'failed' | 'rejected';
  idempotency_key: string;
  approval_request_id: string | null;
  processor_refund_id: string | null;
  requested_by: string | null;
  version: number;
}

async function actorOrFail(): Promise<Actor> {
  const actor = await getService('auth').getActor();
  if (!actor) throw new ForbiddenError();
  return actor;
}

async function paymentFor(actor: Actor, paymentId: string): Promise<PaymentRow> {
  if (actor.companyId) return getRow(actor.companyId, paymentId);
  const { data, error } = await getAdminSupabase()
    .from('payments')
    .select('company_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return getRow(String(data.company_id), paymentId);
}

async function findRefund(companyId: string, key: string): Promise<RefundRow | null> {
  const { data, error } = await getAdminSupabase()
    .from('refunds')
    .select(REFUND_COLUMNS)
    .eq('company_id', companyId)
    .eq('idempotency_key', key)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return (data as RefundRow | null) ?? null;
}

async function getRefund(companyId: string, id: string): Promise<RefundRow> {
  const { data, error } = await getAdminSupabase()
    .from('refunds')
    .select(REFUND_COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as RefundRow;
}

/** Sum of refunds that hold part of the captured amount (everything that is not failed or rejected). */
async function reservedTotal(companyId: string, paymentId: string): Promise<Money> {
  const { data, error } = await getAdminSupabase()
    .from('refunds')
    .select('amount')
    .eq('company_id', companyId)
    .eq('payment_id', paymentId)
    .in('status', ['requested', 'pending_approval', 'processing', 'succeeded'])
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  return Money.sum((data ?? []).map((r) => money(r.amount)));
}

function approvalAction(
  actor: Actor,
  amount: Money,
): 'payment.refund' | 'payment.refund.large' | null {
  if (amount.gt(REFUND_APPROVAL_THRESHOLD_USD)) {
    return actor.role === 'super_admin' ? null : 'payment.refund.large';
  }
  return actor.role === 'staff' ? 'payment.refund' : null;
}

export async function refundPayment(
  paymentId: string,
  amount: Money,
  reason: string | null,
  idempotencyKey: string,
): Promise<PaymentSummary> {
  const actor = await actorOrFail();
  const allowed = await getService('permissions').can(actor, 'payment.refund', {
    type: 'payment',
    id: paymentId,
  });
  if (!allowed) throw new ForbiddenError();
  const payment = await paymentFor(actor, paymentId);

  const prior = await findRefund(payment.company_id, idempotencyKey);
  if (prior) {
    if (prior.payment_id !== payment.id) throw new IdempotencyConflictError();
    return toSummary(await getRow(payment.company_id, payment.id));
  }
  if (payment.status !== 'captured' && payment.status !== 'partially_refunded') {
    throw new ValidationError('Only a payment that was received can be refunded.');
  }
  if (!amount.gt('0')) throw new ValidationError('The refund amount must be above zero.');
  if (amount.gt(refundable(money(payment.captured_amount), money(payment.refunded_amount)))) {
    throw new ValidationError('The refund is more than what is left to refund.');
  }
  const captured = money(payment.captured_amount);
  const capturedAt = payment.captured_at ? new Date(payment.captured_at) : null;
  if (!capturedAt || Date.now() - capturedAt.getTime() > REFUND_WINDOW_DAYS * 86_400_000) {
    throw new ValidationError(
      `Refunds are possible for ${REFUND_WINDOW_DAYS} days after the payment.`,
    );
  }
  if (!payment.processor_id) throw new ValidationError('The payment has no processor.');
  const adapter = await loadAdapter(payment.processor_id);
  requireRefund(adapter, amount.lt(captured) || money(payment.refunded_amount).gt('0'));

  const { data, error } = await getAdminSupabase()
    .from('refunds')
    .insert({
      company_id: payment.company_id,
      payment_id: payment.id,
      invoice_id: payment.invoice_id,
      amount: amount.toDbString(),
      reason,
      status: 'requested',
      idempotency_key: idempotencyKey,
      requested_by: actor.userId,
    })
    .select(REFUND_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') {
      const first = await findRefund(payment.company_id, idempotencyKey);
      if (first && first.payment_id === payment.id)
        return toSummary(await getRow(payment.company_id, payment.id));
      throw new IdempotencyConflictError();
    }
    throw new InternalError(error);
  }
  const refund = data as RefundRow;

  // The reservation includes this refund; if the total is too much, this one is rejected (fails safe under a race).
  const reserved = await reservedTotal(payment.company_id, payment.id);
  if (reserved.gt(captured)) {
    await setRefundStatus(refund, 'rejected');
    throw new ValidationError('The refund is more than what is left to refund.');
  }

  const need = approvalAction(actor, amount);
  if (need) {
    const state = await getService('approval').request({
      action: need,
      payload: { refundId: refund.id, paymentId: payment.id, amount: amount.toDbString() },
      requesterId: actor.userId,
      companyId: payment.company_id,
    });
    await getAdminSupabase()
      .from('refunds')
      .update({ status: 'pending_approval', approval_request_id: state.requestId })
      .eq('company_id', payment.company_id)
      .eq('id', refund.id);
    await auditPayment('payment.refund.requested', payment, {
      refundId: refund.id,
      amount: amount.toDbString(),
      approval: need,
    });
    return toSummary(payment);
  }
  return executeRefund(payment.company_id, refund.id, actor.userId);
}

async function setRefundStatus(
  refund: RefundRow,
  status: RefundRow['status'],
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('refunds')
    .update({ status, ...extra })
    .eq('company_id', refund.company_id)
    .eq('id', refund.id)
    .eq('version', refund.version);
  if (error) throw new InternalError(error);
}

/** Sends the refund to the processor and records the result. */
export async function executeRefund(
  companyId: string,
  refundId: string,
  actorId: string | null,
): Promise<PaymentSummary> {
  let refund = await getRefund(companyId, refundId);
  if (refund.status !== 'requested' && refund.status !== 'pending_approval') {
    return toSummary(await getRow(companyId, refund.payment_id));
  }
  let payment = await getRow(companyId, refund.payment_id);
  if (!payment.processor_id || !payment.processor_transaction_id)
    throw new ValidationError('The payment has no processor transaction.');
  await setRefundStatus(refund, 'processing');
  refund = await getRefund(companyId, refundId);

  const adapter = await loadAdapter(payment.processor_id);
  const refundProcessor = payment.processor_id;
  const used = await resolveCredentials({
    processorId: refundProcessor,
    companyId: payment.company_id,
    accountId: payment.account_id,
    platform: async () => ({
      values: (await loadCurrentCredentials(refundProcessor)).values,
      environment: payment.environment ?? 'sandbox',
    }),
  });
  const values = used.values;
  const amount = money(refund.amount);
  let ok = false;
  let processorRefundId: string | null = null;
  let failure = 'processor_error';
  try {
    const tx = await adapter.refund(
      {
        credentials: values,
        environment: used.accountId ? used.environment : (payment.environment ?? 'sandbox'),
        mode: payment.mode_id ?? defaultMode(adapter).id,
        correlationId: getContext()?.correlationId ?? refund.id,
      },
      {
        idempotencyKey: `${refund.id}:refund`,
        processorTransactionId: payment.processor_transaction_id,
        amount,
        reason: refund.reason,
      },
    );
    ok = tx.status === 'refunded' || tx.status === 'pending' || tx.status === 'captured';
    processorRefundId = tx.processorTransactionId;
    if (!ok) failure = tx.declineCategory ?? 'declined';
    await addAttempt({
      row: payment,
      action: 'refund',
      outcome: ok ? 'refunded' : 'declined',
      rawCode: tx.rawCode,
      message: tx.message,
    });
  } catch (error) {
    logger.error('refund call failed', {
      refundId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    await addAttempt({
      row: payment,
      action: 'refund',
      outcome: 'error',
      message: 'The refund was not confirmed.',
    });
  }
  if (!ok) {
    await setRefundStatus(refund, 'failed', { failure_reason: failure });
    await auditPayment('payment.refund.failed', payment, { refundId, reason: failure });
    throw new ConflictError('The processor did not accept the refund. Nothing was refunded.');
  }
  await setRefundStatus(refund, 'succeeded', { processor_refund_id: processorRefundId });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const total = money(payment.refunded_amount).add(amount);
      const next = statusAfterRefund(money(payment.captured_amount), total);
      payment =
        next === payment.status
          ? await patchPayment(payment, { refunded_amount: total.toDbString() })
          : await transition(payment, next, { refunded_amount: total.toDbString() });
      break;
    } catch (error) {
      if (!(error instanceof ConflictError) || attempt === 2) throw error;
      payment = await getRow(companyId, payment.id);
    }
  }
  await publishPaymentEvent('payment.refunded', payment, {
    refundId,
    refundedAmount: amount.toDbString(),
    actorId,
  });
  await auditPayment('payment.refunded', payment, { refundId, amount: amount.toDbString() });
  return toSummary(payment);
}

/** An approver decides a refund that waits for approval. */
export async function decideRefund(
  actor: Actor,
  refundId: string,
  decision: 'approve' | 'reject',
  reason: string | null,
): Promise<PaymentSummary> {
  const companyId = actor.companyId;
  let refund: RefundRow;
  if (companyId) refund = await getRefund(companyId, refundId);
  else {
    const { data, error } = await getAdminSupabase()
      .from('refunds')
      .select('company_id')
      .eq('id', refundId)
      .maybeSingle();
    if (error) throw new InternalError(error);
    if (!data) throw new NotFoundError();
    refund = await getRefund(String(data.company_id), refundId);
  }
  if (refund.status !== 'pending_approval' || !refund.approval_request_id) {
    throw new ValidationError('This refund is not waiting for approval.');
  }
  const state = await getService('approval').decide(refund.approval_request_id, {
    approverId: actor.userId,
    decision,
    reason,
  });
  if (state.status === 'approved') return executeRefund(refund.company_id, refund.id, actor.userId);
  if (state.status === 'rejected' || state.status === 'cancelled' || state.status === 'expired') {
    await setRefundStatus(refund, 'rejected');
    const payment = await getRow(refund.company_id, refund.payment_id);
    await auditPayment('payment.refund.rejected', payment, { refundId });
    return toSummary(payment);
  }
  return toSummary(await getRow(refund.company_id, refund.payment_id));
}
