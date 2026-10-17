// path: services/payment/payments.ts
// Payment orchestration (STEP 10.7). One payment goes: checks -> routing -> processor authorize (or charge) -> card
// rules -> verification -> capture -> invoice. Amounts come from the invoice and the processor result, never from the
// browser. There is no failover: if the chosen processor cannot take the payment, the payment fails.
import 'server-only';
import { getService, tryGetService } from '@/lib/container';
import {
  ForbiddenError,
  IdempotencyConflictError,
  NetworkBlockedError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  fromZodError,
} from '@/lib/errors';
import { getPublicEnv } from '@/lib/env/public';
import { logger } from '@/lib/logger';
import { getContext } from '@/lib/logger/correlation';
import { PAYMENT_METHODS, type PaymentMethod } from '@/config/processors';
import { PAYMENT_OPEN_EXPIRY_MINUTES } from '@/config/payment-risk';
import {
  requireCapture,
  requireCharge,
  requireVoid,
  supportsCurrency,
} from '@/lib/payment/capabilities';
import { evaluateAddressRules, type CardRuleCode } from '@/lib/payment/card-rules';
import {
  customerMessage,
  isCountedFailure,
  isFraudSignal,
  normalizeCategory,
} from '@/lib/payment/decline';
import { defaultMode } from '@/lib/payment/modes';
import { loadAdapter } from '@/lib/payment/registry';
import { PROCESSOR_UNAVAILABLE, ROUTING_NO_MATCH } from '@/lib/payment/routing';
import { surchargeFor } from '@/lib/payment/state-machine';
import {
  assessVerification,
  threeDSPolicyFor,
  type ReviewReason,
} from '@/lib/payment/verification';
import { createPaymentSchema } from '@/schemas/payment/payments';
import { type Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type {
  AdapterContext,
  CreatePaymentInput,
  InvoiceForPayment,
  InvoiceStatus,
  PaymentSummary,
  ProcessorAdapter,
  ProcessorTransaction,
} from '@/types/contracts';
import { blockCard, checkCard, cardStats, resolveIdentity } from './card-identities';
import { getProcessorRow, loadCurrentCredentials } from './credential-store';
import { auditPayment, publishPaymentEvent } from './payment-events';
import {
  addAttempt,
  findByKey,
  getRow,
  insertPayment,
  listRows,
  money,
  patchPayment,
  toSummary,
  transition,
  upsertAllocation,
  type PaymentRow,
} from './payment-store';
import { createReview } from './review-store';
import { resolveRoute } from './routing';

const PAYABLE: readonly InvoiceStatus[] = ['sent', 'viewed', 'partially_paid', 'overdue'];

export interface PaymentResult extends PaymentSummary {
  /** Set when the payer must finish a step at the processor (3DS redirect or challenge). */
  requiredAction: ProcessorTransaction['requiredAction'];
  /** Text that is safe to show the payer (never the processor's raw message). */
  message: string | null;
  /** True when the payment waits for a manual review: nothing was captured. */
  reviewPending: boolean;
}

interface Bundle {
  adapter: ProcessorAdapter;
  ctx: AdapterContext;
}

export interface StartOptions {
  /** Pay less than the amount due (payment links with a fixed amount). Never taken from the browser. */
  amount?: Money;
  linkId?: string | null;
  method?: PaymentMethod;
  createdBy?: string | null;
}

function result(
  row: PaymentRow,
  extra: { requiredAction?: ProcessorTransaction['requiredAction']; message?: string | null } = {},
): PaymentResult {
  return {
    ...toSummary(row),
    requiredAction: extra.requiredAction ?? null,
    message: extra.message ?? null,
    reviewPending: row.status === 'pending_review',
  };
}

function totalOf(row: PaymentRow): Money {
  return money(row.amount).add(money(row.surcharge_amount));
}

async function bundleFor(row: PaymentRow): Promise<Bundle> {
  if (!row.processor_id) throw new ValidationError('This payment has no processor.');
  const adapter = await loadAdapter(row.processor_id);
  const { values } = await loadCurrentCredentials(row.processor_id);
  return {
    adapter,
    ctx: {
      credentials: values,
      environment: row.environment ?? 'sandbox',
      mode: row.mode_id ?? defaultMode(adapter).id,
      correlationId: getContext()?.correlationId ?? row.id,
    },
  };
}

/** Marks a payment failed and tells the rest of the platform. */
async function failPayment(
  row: PaymentRow,
  reason: string,
  options: { category?: string | null; message?: string | null } = {},
): Promise<PaymentResult> {
  const failed = await transition(row, 'failed', {
    failure_reason: reason,
    decline_category: options.category ?? null,
  });
  await publishPaymentEvent('payment.failed', failed, { reason });
  await auditPayment('payment.failed', failed, { reason });
  return result(failed, { message: options.message ?? customerMessage(null) });
}

function threeDsJson(tx: ProcessorTransaction): Record<string, unknown> {
  return {
    requested: tx.threeDS.requested,
    completed: tx.threeDS.completed,
    authenticated: tx.threeDS.authenticated,
    liabilityShift: tx.threeDS.liabilityShift,
  };
}

/** Starts a payment for an invoice. The core of the `payments` contract. */
export async function startPayment(
  input: CreatePaymentInput,
  options: StartOptions = {},
): Promise<PaymentResult> {
  const parsed = createPaymentSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const data = parsed.data;

  if (!sameOrigin(data.returnUrl)) throw new ValidationError('The return address is not allowed.');

  // The invoices contract also hides invoices of other companies from a signed-in caller (404).
  const invoice = await getService('invoices').getForPayment(data.invoiceId);
  const existing = await findByKey(invoice.companyId, data.idempotencyKey);
  if (existing) {
    if (existing.invoice_id !== invoice.invoiceId) throw new IdempotencyConflictError();
    return result(existing);
  }
  if (!PAYABLE.includes(invoice.status) || !invoice.amountDue.gt('0')) {
    throw new ValidationError('This invoice cannot be paid right now.');
  }
  const base = options.amount ?? invoice.amountDue;
  if (!base.gt('0') || base.gt(invoice.amountDue)) {
    throw new ValidationError('The amount is more than the balance of the invoice.');
  }
  const method = options.method ?? 'card';
  if (!PAYMENT_METHODS.includes(method)) throw new ValidationError('Unknown payment method.');

  const security = getService('security');
  const limit = await security.rateLimit(`payment:${data.payerIp}`, 'strict');
  if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);
  const network = await security.checkNetwork(data.payerIp, 'payment');
  if (!network.allowed) {
    await security.raiseSecurityEvent('network_blocked', {
      context: 'payment',
      invoiceId: invoice.invoiceId,
      reason: network.reason,
    });
    throw new NetworkBlockedError();
  }
  const address = evaluateAddressRules({
    ipAttempts: (
      await cardStats({ identityId: null, ip: data.payerIp, invoiceId: invoice.invoiceId })
    ).ipAttempts,
  });
  if (!address.allowed) {
    await security.raiseSecurityEvent('other', {
      kind: 'payment_velocity',
      code: address.code,
      invoiceId: invoice.invoiceId,
    });
    throw new RateLimitError(3600, 'Too many payment attempts. Please try again later.');
  }

  const surcharge = surchargeFor(base);
  const created = await insertPayment({
    company_id: invoice.companyId,
    invoice_id: invoice.invoiceId,
    client_id: invoice.clientId === '' ? null : invoice.clientId,
    idempotency_key: data.idempotencyKey,
    amount: base.toDbString(),
    surcharge_amount: surcharge.toDbString(),
    payment_method: method,
    payer_ip: data.payerIp,
    payer_country: network.countryCode,
    billing_postal_code: data.billingPostalCode,
    link_id: options.linkId ?? null,
    correlation_id: getContext()?.correlationId ?? null,
    created_by: options.createdBy ?? null,
  });
  if ('replay' in created) return result(created.replay);
  let row = created.row;

  const plan = await planOf(invoice.companyId);
  const decision = await resolveRoute({
    amount: base,
    country: invoice.billingCountry,
    method,
    plan,
  });
  if (!decision) return failPayment(row, ROUTING_NO_MATCH);

  let bundle: Bundle;
  try {
    const processor = await getProcessorRow(decision.processorId);
    if (!processor.enabled) return failPayment(row, PROCESSOR_UNAVAILABLE);
    const adapter = await loadAdapter(decision.processorId);
    if (!supportsCurrency(adapter, 'USD')) return failPayment(row, 'currency_not_supported');
    const { values } = await loadCurrentCredentials(decision.processorId);
    row = await patchPayment(row, {
      processor_id: decision.processorId,
      mode_id: processor.active_mode,
      environment: processor.environment,
    });
    bundle = {
      adapter,
      ctx: {
        credentials: values,
        environment: processor.environment,
        mode: processor.active_mode,
        correlationId: getContext()?.correlationId ?? row.id,
      },
    };
  } catch (error) {
    logger.warn('processor not usable for payment', { paymentId: row.id, error: String(error) });
    return failPayment(row, PROCESSOR_UNAVAILABLE);
  }

  const total = totalOf(row);
  const authorizeInput = {
    idempotencyKey: `${row.id}:authorize`,
    amount: total,
    invoiceId: invoice.invoiceId,
    companyId: invoice.companyId,
    paymentToken: data.paymentToken,
    billing: { postalCode: data.billingPostalCode, country: invoice.billingCountry },
    payerIp: data.payerIp,
    returnUrl: data.returnUrl,
    threeDS: threeDSPolicyFor(bundle.adapter),
    metadata: { paymentId: row.id, invoiceId: invoice.invoiceId, companyId: invoice.companyId },
  };

  const singleStep = !bundle.adapter.capabilities.supportsAuthCapture;
  if (singleStep) {
    // No separate capture: the same two checks run before the charge is sent (REQ-VERIFY item 3).
    const verdict = assessVerification({
      threeDS: null,
      givenPostalCode: data.billingPostalCode,
      invoicePostalCode: invoice.billingPostalCode,
      avsPostalCodeMatch: null,
      ipCountry: network.countryCode,
      invoiceCountry: invoice.billingCountry,
    });
    if (verdict.outcome === 'review') {
      await addAttempt({
        row,
        action: 'charge',
        outcome: 'blocked',
        message: verdict.reasons.join(','),
      });
      await tryGetService('security')?.raiseSecurityEvent('other', {
        kind: 'payment_verification_mismatch',
        reasons: verdict.reasons,
        invoiceId: invoice.invoiceId,
      });
      return failPayment(row, 'verification_mismatch', {
        message: 'We could not verify this payment. Please contact the seller.',
      });
    }
  }

  let tx: ProcessorTransaction;
  try {
    tx = singleStep
      ? await requireCharge(bundle.adapter)(bundle.ctx, authorizeInput)
      : await bundle.adapter.authorize(bundle.ctx, authorizeInput);
  } catch (error) {
    logger.error('processor call failed', {
      paymentId: row.id,
      processor: decision.processorId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    await addAttempt({
      row,
      action: singleStep ? 'charge' : 'authorize',
      outcome: 'error',
      message: 'The processor did not answer.',
    });
    return failPayment(row, 'processor_error', { message: customerMessage('processor_error') });
  }
  return handleTransaction(
    row,
    invoice,
    bundle,
    tx,
    singleStep ? 'charge' : 'authorize',
    network.countryCode,
  );
}

/** The payer returns only to a page of this application (no open redirect after 3D Secure). */
function sameOrigin(url: string): boolean {
  try {
    return new URL(url).origin === new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).origin;
  } catch {
    return false;
  }
}

async function planOf(companyId: string): Promise<string> {
  const { data } = await getAdminSupabase()
    .from('companies')
    .select('plan_key')
    .eq('id', companyId)
    .maybeSingle();
  return data ? String(data.plan_key) : 'free';
}

/** Applies what the processor answered. Used after authorize, charge and after the payer returns from 3DS. */
async function handleTransaction(
  start: PaymentRow,
  invoice: InvoiceForPayment,
  bundle: Bundle,
  tx: ProcessorTransaction,
  action: 'authorize' | 'charge' | 'status',
  ipCountry: string | null,
): Promise<PaymentResult> {
  let row = start;
  let identityId: string | null = null;
  let identityHmacValue: string | null = null;
  if (tx.cardIdentity && row.processor_id) {
    const resolved = await resolveIdentity(row.processor_id, tx.cardIdentity);
    identityId = resolved.id;
    identityHmacValue = resolved.hmac;
    if (row.card_identity_id !== identityId)
      row = await patchPayment(row, { card_identity_id: identityId });
  }
  const category = tx.declineCategory ? normalizeCategory(tx.declineCategory) : null;
  // The card rules run before this attempt is written, so the attempt itself is not counted against the card.
  // Card identity exists only now (docs/steps/STEP-10/DECISIONS.md D3).
  let ruleCode: CardRuleCode | null = null;
  if (
    (tx.status === 'authorized' || tx.status === 'captured') &&
    tx.cardIdentity &&
    row.processor_id
  ) {
    const check = await checkCard({
      processorId: row.processor_id,
      identity: tx.cardIdentity,
      ip: row.payer_ip ?? '',
      invoiceId: row.invoice_id,
    });
    if (!check.decision.allowed) ruleCode = check.decision.code;
  }
  const attemptOutcome = ruleCode ? 'blocked' : tx.status === 'declined' ? 'declined' : tx.status;
  await addAttempt({
    row,
    action,
    outcome: attemptOutcome,
    declineCategory: category,
    countedFailure: tx.status === 'declined' && isCountedFailure(category),
    rawCode: tx.rawCode,
    message: ruleCode ?? tx.message,
    cardIdentityId: identityId,
  });
  const threeDs = threeDsJson(tx);

  switch (tx.status) {
    case 'declined':
    case 'error': {
      if (isFraudSignal(category) && identityHmacValue && row.processor_id) {
        await blockCard({
          processorId: row.processor_id,
          hmac: identityHmacValue,
          reason: 'Flagged by the processor fraud signal',
          source: 'processor_fraud_signal',
          actorId: null,
        });
      }
      return failPayment(row, 'declined', { category, message: customerMessage(category) });
    }
    case 'requires_action': {
      const moved = await transition(row, 'requires_action', {
        processor_transaction_id: tx.processorTransactionId ?? row.processor_transaction_id,
        three_ds: threeDs,
      });
      return result(moved, { requiredAction: tx.requiredAction });
    }
    case 'pending': {
      const moved = await patchPayment(row, {
        processor_transaction_id: tx.processorTransactionId ?? row.processor_transaction_id,
        three_ds: threeDs,
      });
      return result(moved, {
        message: 'The payment is being processed. You will be told when it is done.',
      });
    }
    case 'voided':
    case 'refunded':
      return failPayment(row, tx.status);
    case 'authorized':
    case 'captured':
      break;
  }

  if (!tx.processorTransactionId) {
    return failPayment(row, 'processor_error', { message: customerMessage('processor_error') });
  }

  if (ruleCode) {
    await tryGetService('security')?.raiseSecurityEvent('other', {
      kind: 'card_rule',
      code: ruleCode,
      paymentId: row.id,
    });
    await undoAuthorization(row, bundle, tx);
    return failPayment(row, ruleCode, { message: customerMessage('other') });
  }

  const base: Record<string, unknown> = {
    processor_transaction_id: tx.processorTransactionId,
    three_ds: threeDs,
  };
  if (tx.status === 'captured') {
    return settleCaptured(row, tx.processorTransactionId, base);
  }

  const authorized = await transition(row, 'authorized', {
    ...base,
    authorized_at: new Date().toISOString(),
  });
  await publishPaymentEvent('payment.authorized', authorized);
  await auditPayment('payment.authorized', authorized);

  const verdict = assessVerification({
    threeDS: tx.threeDS,
    givenPostalCode: authorized.billing_postal_code,
    invoicePostalCode: invoice.billingPostalCode,
    avsPostalCodeMatch: tx.avsPostalCodeMatch,
    ipCountry: ipCountry ?? authorized.payer_country,
    invoiceCountry: invoice.billingCountry,
  });
  if (verdict.outcome === 'review') return holdForReview(authorized, verdict.reasons);
  return captureAuthorized(authorized, bundle);
}

/** Gives an authorization back (void) or a single-step charge (refund) when a rule refuses the card after the answer. */
async function undoAuthorization(
  row: PaymentRow,
  bundle: Bundle,
  tx: ProcessorTransaction,
): Promise<void> {
  if (!tx.processorTransactionId) return;
  try {
    if (tx.status === 'authorized') {
      await requireVoid(bundle.adapter)(bundle.ctx, {
        idempotencyKey: `${row.id}:void`,
        processorTransactionId: tx.processorTransactionId,
      });
    } else if (tx.status === 'captured') {
      await bundle.adapter.refund(bundle.ctx, {
        idempotencyKey: `${row.id}:undo`,
        processorTransactionId: tx.processorTransactionId,
        amount: totalOf(row),
        reason: 'card rule',
      });
    }
    await addAttempt({
      row,
      action: tx.status === 'authorized' ? 'void' : 'refund',
      outcome: tx.status === 'authorized' ? 'voided' : 'refunded',
    });
  } catch (error) {
    logger.error('could not undo a refused payment', { paymentId: row.id, error: String(error) });
    await addAttempt({
      row,
      action: 'void',
      outcome: 'error',
      message: 'Undo failed, check the processor.',
    });
  }
}

async function holdForReview(row: PaymentRow, reasons: ReviewReason[]): Promise<PaymentResult> {
  const held = await transition(row, 'pending_review');
  const until = await createReview(held, reasons, new Date());
  await publishPaymentEvent('payment.pending_review', held, {
    reasons,
    holdUntil: until.toISOString(),
  });
  await auditPayment('payment.pending_review', held, { reasons });
  return result(held, {
    message: 'Your payment is being checked. You will receive a confirmation when it is done.',
  });
}

/** Captures an authorization and settles the invoice. Also used by the review queue and the webhook core. */
export async function captureAuthorized(row: PaymentRow, bundle: Bundle): Promise<PaymentResult> {
  if (!row.processor_transaction_id)
    throw new ValidationError('The payment has no processor transaction.');
  const total = totalOf(row);
  let tx: ProcessorTransaction;
  try {
    tx = await requireCapture(bundle.adapter)(bundle.ctx, {
      idempotencyKey: `${row.id}:capture`,
      processorTransactionId: row.processor_transaction_id,
      amount: total,
    });
  } catch (error) {
    logger.error('capture failed', {
      paymentId: row.id,
      error: error instanceof Error ? error.name : 'unknown',
    });
    await addAttempt({
      row,
      action: 'capture',
      outcome: 'error',
      message: 'The capture was not confirmed.',
    });
    await tryVoid(row, bundle);
    return failPayment(row, 'capture_failed', { message: customerMessage('processor_error') });
  }
  await addAttempt({
    row,
    action: 'capture',
    outcome: tx.status === 'captured' ? 'captured' : 'declined',
    rawCode: tx.rawCode,
    message: tx.message,
  });
  if (tx.status !== 'captured') {
    await tryVoid(row, bundle);
    return failPayment(row, 'capture_failed', {
      category: tx.declineCategory,
      message: customerMessage(tx.declineCategory),
    });
  }
  return settleCaptured(row, row.processor_transaction_id, {});
}

async function tryVoid(row: PaymentRow, bundle: Bundle): Promise<void> {
  if (!row.processor_transaction_id) return;
  try {
    await requireVoid(bundle.adapter)(bundle.ctx, {
      idempotencyKey: `${row.id}:void`,
      processorTransactionId: row.processor_transaction_id,
    });
    await addAttempt({ row, action: 'void', outcome: 'voided' });
  } catch (error) {
    logger.error('void after failed capture did not work', {
      paymentId: row.id,
      error: String(error),
    });
    await addAttempt({
      row,
      action: 'void',
      outcome: 'error',
      message: 'Void failed, check the processor.',
    });
  }
}

async function settleCaptured(
  row: PaymentRow,
  processorTransactionId: string,
  patch: Record<string, unknown>,
): Promise<PaymentResult> {
  const captured = await transition(row, 'captured', {
    ...patch,
    processor_transaction_id: processorTransactionId,
    captured_amount: totalOf(row).toDbString(),
    captured_at: new Date().toISOString(),
  });
  await finishCapture(captured);
  return result(captured, { message: 'Thank you. Your payment was received.' });
}

/** Allocation + invoice update. Safe to run again: both steps are idempotent. */
export async function finishCapture(row: PaymentRow): Promise<void> {
  const amount = money(row.amount);
  await upsertAllocation(row, amount);
  try {
    await getService('invoices').applyPayment({
      invoiceId: row.invoice_id,
      paymentId: row.id,
      amount,
    });
  } catch (error) {
    logger.error('invoice not updated after capture; the settle job will retry', {
      paymentId: row.id,
      error: String(error),
    });
  }
  await publishPaymentEvent('payment.captured', row, {
    capturedAmount: money(row.captured_amount).toDbString(),
  });
  await auditPayment('payment.captured', row, {
    capturedAmount: money(row.captured_amount).toDbString(),
  });
}

/** Voids an authorization (review decision, expiry, or an administrator). */
export async function voidAuthorized(row: PaymentRow, reason: string): Promise<PaymentResult> {
  if (row.status !== 'authorized' && row.status !== 'pending_review') {
    throw new ValidationError('Only an authorization can be voided.');
  }
  const bundle = await bundleFor(row);
  if (row.processor_transaction_id) {
    try {
      await requireVoid(bundle.adapter)(bundle.ctx, {
        idempotencyKey: `${row.id}:void`,
        processorTransactionId: row.processor_transaction_id,
      });
      await addAttempt({ row, action: 'void', outcome: 'voided' });
    } catch (error) {
      await addAttempt({
        row,
        action: 'void',
        outcome: 'error',
        message: 'The void was not confirmed.',
      });
      throw error;
    }
  }
  const voided = await transition(row, 'voided', {
    failure_reason: reason.slice(0, 200),
    voided_at: new Date().toISOString(),
  });
  await publishPaymentEvent('payment.voided', voided, { reason });
  await auditPayment('payment.voided', voided, { reason });
  return result(voided);
}

/** Captures a held authorization after a reviewer approved it. */
export async function captureHeld(row: PaymentRow): Promise<PaymentResult> {
  if (row.status !== 'pending_review' && row.status !== 'authorized') {
    throw new ValidationError('Only an authorization can be captured.');
  }
  return captureAuthorized(row, await bundleFor(row));
}

/** Continues a payment after 3DS (the payer came back) or when a webhook says the state changed. */
export async function resumePayment(companyId: string, paymentId: string): Promise<PaymentResult> {
  const row = await getRow(companyId, paymentId);
  if (row.status !== 'requires_action' && row.status !== 'created') return result(row);
  if (!row.processor_transaction_id) return result(row);
  const bundle = await bundleFor(row);
  const tx = await bundle.adapter.getTransaction(bundle.ctx, row.processor_transaction_id);
  const invoice = await getService('invoices').getForPayment(row.invoice_id);
  return handleTransaction(row, invoice, bundle, tx, 'status', row.payer_country);
}

/** Settles captured payments whose invoice update did not finish. Run by the cron job. */
export async function settleOrphans(limit: number): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('payments')
    .select('id, company_id')
    .eq('status', 'captured')
    .is('deleted_at', null)
    .order('captured_at', { ascending: true })
    .limit(limit * 4);
  if (error) throw error;
  let settled = 0;
  for (const p of data ?? []) {
    if (settled >= limit) break;
    const { data: alloc } = await getAdminSupabase()
      .from('payment_allocations')
      .select('id')
      .eq('payment_id', p.id)
      .eq('company_id', p.company_id)
      .maybeSingle();
    if (alloc) continue;
    await finishCapture(await getRow(String(p.company_id), String(p.id)));
    settled += 1;
  }
  return settled;
}

export async function getPayment(paymentId: string): Promise<PaymentSummary> {
  const actor = await getService('auth').getActor();
  if (!actor) throw new ForbiddenError();
  if (actor.companyId) return toSummary(await getRow(actor.companyId, paymentId));
  const { data, error } = await getAdminSupabase()
    .from('payments')
    .select('company_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (error || !data) throw new NotFoundError();
  return toSummary(await getRow(String(data.company_id), paymentId));
}

export async function listPayments(
  companyId: string,
  filter: { status?: PaymentRow['status']; invoiceId?: string; limit: number },
): Promise<PaymentSummary[]> {
  return (await listRows(companyId, filter)).map(toSummary);
}

/** Fails payments that never finished (payer left during 3DS, request died). Run by the cron job. */
export async function expireStaleOpen(limit: number): Promise<number> {
  const cutoff = new Date(Date.now() - PAYMENT_OPEN_EXPIRY_MINUTES * 60_000).toISOString();
  const { data, error } = await getAdminSupabase()
    .from('payments')
    .select('id, company_id')
    .in('status', ['created', 'requires_action'])
    .is('processor_transaction_id', null)
    .lt('created_at', cutoff)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  let expired = 0;
  for (const p of data ?? []) {
    try {
      await failPayment(await getRow(String(p.company_id), String(p.id)), 'expired');
      expired += 1;
    } catch (e) {
      logger.warn('stale payment not expired', { paymentId: String(p.id), error: String(e) });
    }
  }
  return expired;
}

/** Same for requires_action payments that have a processor transaction: the payer never came back. */
export async function expireAbandonedChallenges(limit: number): Promise<number> {
  const cutoff = new Date(Date.now() - PAYMENT_OPEN_EXPIRY_MINUTES * 60_000).toISOString();
  const { data, error } = await getAdminSupabase()
    .from('payments')
    .select('id, company_id')
    .eq('status', 'requires_action')
    .lt('created_at', cutoff)
    .is('deleted_at', null)
    .limit(limit);
  if (error) throw error;
  let expired = 0;
  for (const p of data ?? []) {
    try {
      await failPayment(await getRow(String(p.company_id), String(p.id)), 'expired');
      expired += 1;
    } catch (e) {
      logger.warn('abandoned challenge not expired', { paymentId: String(p.id), error: String(e) });
    }
  }
  return expired;
}
