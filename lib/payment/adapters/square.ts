// path: lib/payment/adapters/square.ts
// Square adapter (docs/processors/square.md): Payments API with the Web Payments SDK card element. The browser turns
// the card into a single-use token inside Square's own frame (3D Secure included); this code authorizes, captures,
// cancels and refunds with that token and the payment ids. No card data reaches this code.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { buildTransaction, defineAdapter, toMinorUnits } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, ProcessorAdapter, ProcessorTransaction } from '@/types/contracts';
import { requestKey, sdkUrl, squareCall, str, obj, type Json } from './square/api';
import { failureFromErrors, fromPayment, mapSquareDecline, moneyOf } from './square/mapping';
import { parseSquareEvent, verifySquareWebhook } from './square/webhook';

export { mapSquareDecline };

const TOKEN = /^cnon:[A-Za-z0-9._-]{3,300}$/;
const OBJECT_ID = /^[A-Za-z0-9_-]{8,80}$/;
/** Platform hold stays inside Square's own 7 day automatic cancel (docs section 5). */
const DELAY_DURATION = 'PT144H';

/** Whole cents as the integer Square expects in `Money.amount`. */
function cents(amount: Money): number {
  return +toMinorUnits(amount);
}

function paymentIdOf(value: string): string {
  if (!OBJECT_ID.test(value)) throw new ValidationError('Not a Square payment id.');
  return value;
}

function refused(amount: Money, code: string, message: string): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapSquareDecline({ code, message: null }),
    rawCode: code,
    message,
  });
}

async function loadPayment(ctx: AdapterContext, id: string): Promise<Json | null> {
  const result = await squareCall(ctx, 'GET', `/v2/payments/${paymentIdOf(id)}`, null);
  return result.status === 200 ? obj(result.body.payment) : null;
}

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'square',
  displayName: 'Square',
  capabilities: {
    supportsAuthCapture: true,
    supportsThreeDS: false,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: false,
    modes: [{ id: 'web_payments', label: 'Web Payments SDK', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'applicationId',
      label: 'Application ID',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9_-]{10,80}$',
      helpText:
        'From the application in the Square Developer Console (Sandbox mode for the sandbox environment).',
    },
    {
      key: 'locationId',
      label: 'Location ID',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9]{6,40}$',
      helpText: 'The USD location that receives the payments.',
    },
    {
      key: 'accessToken',
      label: 'Access token',
      secret: true,
      required: true,
      pattern: '^[A-Za-z0-9_-]{20,300}$',
      helpText: 'A seller access token with the payments and merchant profile read permissions.',
    },
    {
      key: 'webhookSignatureKey',
      label: 'Webhook signature key',
      secret: true,
      required: true,
      pattern: '^[A-Za-z0-9_+=/-]{10,100}$',
      helpText: 'The signature key of the webhook subscription for the platform URL.',
    },
    {
      key: 'webhookUrl',
      label: 'Webhook notification URL',
      secret: false,
      required: true,
      pattern: '^https://[^\\s]{5,300}$',
      helpText:
        'The exact notification URL entered in the subscription (it is part of the signature).',
    },
  ],

  async testConnection(ctx) {
    try {
      const result = await squareCall(
        ctx,
        'GET',
        `/v2/locations/${encodeURIComponent(ctx.credentials.locationId ?? '')}`,
        null,
      );
      const location = obj(result.body.location);
      if (result.status !== 200 || !location)
        return { ok: false, message: 'Square accepted the token, but not this location id.' };
      const capabilities = Array.isArray(location.capabilities) ? location.capabilities : [];
      if (location.status !== 'ACTIVE' || !capabilities.includes('CREDIT_CARD_PROCESSING'))
        return { ok: false, message: 'This location cannot process card payments.' };
      if (location.currency !== 'USD')
        return { ok: false, message: 'This location does not take USD payments.' };
      return {
        ok: true,
        message: 'Square accepted the access token and the location.',
        details: { mode: ctx.environment },
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof ValidationError ? error.message : 'Square could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx, input) {
    const applicationId = ctx.credentials.applicationId ?? '';
    const locationId = ctx.credentials.locationId ?? '';
    if (applicationId === '' || locationId === '')
      throw new ValidationError('The Square application id or location id is missing.');
    const whole = toMinorUnits(input.amount).padStart(3, '0');
    return {
      clientConfig: {
        applicationId,
        locationId,
        sdkUrl: sdkUrl(ctx.environment),
        environment: ctx.environment,
        amount: `${whole.slice(0, -2)}.${whole.slice(-2)}`,
      },
      expiresAt: null,
    };
  },

  async authorize(ctx, input) {
    if (!TOKEN.test(input.paymentToken)) throw new ValidationError('Not a Square payment token.');
    const result = await squareCall(ctx, 'POST', '/v2/payments', {
      source_id: input.paymentToken,
      idempotency_key: requestKey(input.idempotencyKey),
      amount_money: { amount: cents(input.amount), currency: 'USD' },
      autocomplete: false,
      delay_duration: DELAY_DURATION,
      delay_action: 'CANCEL',
      location_id: ctx.credentials.locationId ?? '',
      reference_id: input.invoiceId.slice(0, 40),
      customer_details: { customer_initiated: true, seller_keyed_in: false },
    });
    const payment = obj(result.body.payment);
    if (payment && result.errors.length === 0) return fromPayment(payment, input.amount);
    return failureFromErrors(result.errors, input.amount);
  },

  async capture(ctx, input) {
    const id = paymentIdOf(input.processorTransactionId);
    const current = await loadPayment(ctx, id);
    if (!current)
      return refused(input.amount, 'PAYMENT_NOT_FOUND', 'Square does not know this payment.');
    const state = fromPayment(current, input.amount);
    if (state.status === 'captured') return state;
    if (state.status !== 'authorized')
      return refused(input.amount, 'PAYMENT_NOT_CAPTURABLE', 'This payment cannot be captured.');
    // CompletePayment has no amount: the whole authorization is captured (docs section 5).
    if (!state.amount.eq(input.amount))
      return refused(
        input.amount,
        'CAPTURE_AMOUNT_MISMATCH',
        'Square can only capture the full authorized amount.',
      );
    const result = await squareCall(ctx, 'POST', `/v2/payments/${id}/complete`, {});
    const payment = obj(result.body.payment);
    if (payment && result.errors.length === 0) return fromPayment(payment, input.amount);
    if (result.errors.some((e) => e.code === 'DELAYED_TRANSACTION_CAPTURED')) {
      const after = await loadPayment(ctx, id);
      if (after) return fromPayment(after, input.amount);
    }
    return failureFromErrors(result.errors, input.amount);
  },

  async voidAuthorization(ctx, input) {
    const id = paymentIdOf(input.processorTransactionId);
    const result = await squareCall(ctx, 'POST', `/v2/payments/${id}/cancel`, {});
    const payment = obj(result.body.payment);
    if (payment && result.errors.length === 0) return fromPayment(payment, null);
    if (result.errors.some((e) => e.code === 'DELAYED_TRANSACTION_CANCELED')) {
      const after = await loadPayment(ctx, id);
      if (after) return fromPayment(after, null);
    }
    return failureFromErrors(result.errors, Money.zero());
  },

  async refund(ctx, input) {
    const id = paymentIdOf(input.processorTransactionId);
    const result = await squareCall(ctx, 'POST', '/v2/refunds', {
      idempotency_key: requestKey(input.idempotencyKey),
      payment_id: id,
      amount_money: { amount: cents(input.amount), currency: 'USD' },
      ...(input.reason ? { reason: input.reason.slice(0, 190) } : {}),
    });
    const refund = obj(result.body.refund);
    if (!refund || result.errors.length > 0) return failureFromErrors(result.errors, input.amount);
    const state = str(refund.status);
    return buildTransaction({
      status: state === 'COMPLETED' ? 'refunded' : state === 'PENDING' ? 'pending' : 'declined',
      amount: moneyOf(refund.amount_money) ?? input.amount,
      processorTransactionId: str(refund.id),
      declineCategory: state === 'FAILED' || state === 'REJECTED' ? 'processor_error' : null,
      rawCode: state,
    });
  },

  async getTransaction(ctx, id) {
    const payment = await loadPayment(ctx, id);
    if (!payment) throw new ValidationError('Square does not know this payment.');
    return fromPayment(payment, null);
  },

  verifyWebhook: (ctx, request) => verifySquareWebhook(ctx, request),
  parseWebhook: (request) => parseSquareEvent(request.rawBody),
  cardIdentity: (transaction) => transaction.cardIdentity,
  mapDecline: mapSquareDecline,
});
