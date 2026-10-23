// path: lib/payment/adapters/rapyd.ts
// Rapyd adapter (docs/processors/rapyd.md): Checkout Toolkit. The server creates a checkout page for the invoice (card
// category only, captured at once); the card is typed in Rapyd's own iframe; this code reads the payment back and
// verifies it against the invoice, and refunds through the refund API. No card data reaches this code.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { buildTransaction, defineAdapter } from '@/lib/payment/adapters/base';
import type { Money } from '@/lib/utils/currency';
import type { AdapterContext, ProcessorAdapter, ProcessorTransaction } from '@/types/contracts';
import {
  CHECKOUT_ID,
  PAYMENT_ID,
  TOOLKIT_URLS,
  amountSlot,
  jsonWithAmounts,
  obj,
  rapydCall,
  str,
  type Json,
} from './rapyd/api';
import { failure, fromPayment, fromRefund, mapRapydDecline, moneyOf } from './rapyd/mapping';
import { parseRapydEvent, verifyRapydWebhook } from './rapyd/webhook';

export { mapRapydDecline };

const PAYMENT_EXPIRY_SECONDS = 3600;

function paymentIdOf(value: string): string {
  if (!PAYMENT_ID.test(value)) throw new ValidationError('Not a Rapyd payment id.');
  return value;
}

function refused(amount: Money, code: string, message: string): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapRapydDecline({ code, message: null }),
    rawCode: code,
    message,
  });
}

async function loadPayment(ctx: AdapterContext, id: string): Promise<Json | null> {
  const result = await rapydCall(ctx, 'get', `/v1/payments/${paymentIdOf(id)}`, null);
  return result.ok && result.data && str(result.data.id) ? result.data : null;
}

/** Reads the payment back and checks it is a paid card payment of this invoice and amount. */
async function verifyPayment(
  ctx: AdapterContext,
  token: string,
  invoiceId: string,
  amount: Money,
): Promise<ProcessorTransaction> {
  const payment = await loadPayment(ctx, token);
  if (!payment) return refused(amount, 'PAYMENT_NOT_FOUND', 'Rapyd does not know this payment.');
  const reference = invoiceId.slice(0, 45);
  const paid = moneyOf(payment.amount);
  const tagged =
    str(payment.merchant_reference_id) === reference ||
    str(obj(payment.metadata)?.invoice_id) === invoiceId.slice(0, 100);
  if (
    payment.currency_code !== 'USD' ||
    str(payment.payment_method_type_category) !== 'card' ||
    !tagged ||
    !paid ||
    !paid.eq(amount)
  )
    return refused(amount, 'PAYMENT_MISMATCH', 'This payment does not belong to this invoice.');
  const result = fromPayment(payment, amount);
  return result.status === 'captured'
    ? result
    : refused(amount, 'PAYMENT_NOT_COMPLETED', 'The payment was not completed.');
}

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'rapyd',
  displayName: 'Rapyd',
  capabilities: {
    supportsAuthCapture: false,
    supportsThreeDS: false,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: false,
    modes: [{ id: 'checkout_toolkit', label: 'Checkout Toolkit (card)', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'accessKey',
      label: 'Access key',
      secret: true,
      required: true,
      pattern: '^[A-Za-z0-9_-]{8,100}$',
      helpText: 'Client Portal, Developers, Credentials (sandbox keys for the sandbox).',
    },
    {
      key: 'secretKey',
      label: 'Secret key',
      secret: true,
      required: true,
      pattern: '^[A-Za-z0-9_-]{16,200}$',
      helpText: 'Client Portal, Developers, Credentials.',
    },
    {
      key: 'webhookUrl',
      label: 'Webhook URL',
      secret: false,
      required: true,
      pattern: '^https://[^\\s]{4,500}$',
      helpText:
        'The exact URL typed in Developers, Webhooks, Management; Rapyd includes it in the webhook signature.',
    },
    {
      key: 'merchantCountry',
      label: 'Merchant country',
      secret: false,
      required: true,
      pattern: '^[A-Z]{2}$',
      helpText: 'Two-letter country of the checkout page (decides the available card methods).',
    },
  ],

  async testConnection(ctx) {
    try {
      const result = await rapydCall(
        ctx,
        'get',
        '/v1/payments/payment_00000000000000000000000000000000',
        null,
      );
      if (result.errorCode === 'ERROR_GET_PAYMENT')
        return {
          ok: true,
          message: 'Rapyd accepted the keys.',
          details: { mode: ctx.environment },
        };
      return { ok: false, message: 'Rapyd did not answer as expected for these keys.' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof ValidationError ? error.message : 'Rapyd could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx, input) {
    const country = ctx.credentials.merchantCountry ?? '';
    if (!/^[A-Z]{2}$/.test(country))
      throw new ValidationError('The Rapyd merchant country is missing or malformed.');
    if (!input.returnUrl.startsWith('https://'))
      throw new ValidationError('Rapyd needs an https return address.');
    const reference = input.invoiceId.slice(0, 45);
    const result = await rapydCall(
      ctx,
      'post',
      '/v1/checkout',
      jsonWithAmounts({
        amount: amountSlot(input.amount),
        currency: 'USD',
        country,
        merchant_reference_id: reference,
        metadata: {
          invoice_id: input.invoiceId.slice(0, 100),
          company_id: input.companyId.slice(0, 100),
        },
        payment_method_type_categories: ['card'],
        capture: true,
        language: 'en',
        payment_expiration: PAYMENT_EXPIRY_SECONDS,
        complete_payment_url: input.returnUrl,
        error_payment_url: input.returnUrl,
        complete_checkout_url: input.returnUrl,
        cancel_checkout_url: input.returnUrl,
      }),
      input.idempotencyKey,
    );
    const id = result.data ? str(result.data.id) : null;
    if (!result.ok || !id || !CHECKOUT_ID.test(id))
      throw new ValidationError(
        `Rapyd refused to create the checkout page${result.errorCode ? ` (${result.errorCode})` : ''}.`,
      );
    return {
      clientConfig: { checkoutId: id, scriptUrl: TOOLKIT_URLS[ctx.environment] },
      expiresAt: new Date(Date.now() + PAYMENT_EXPIRY_SECONDS * 1000).toISOString(),
    };
  },

  async authorize(ctx, input) {
    return verifyPayment(ctx, input.paymentToken, input.invoiceId, input.amount);
  },

  async charge(ctx, input) {
    return verifyPayment(ctx, input.paymentToken, input.invoiceId, input.amount);
  },

  async refund(ctx, input) {
    const id = paymentIdOf(input.processorTransactionId);
    const payment = await loadPayment(ctx, id);
    if (!payment)
      return refused(input.amount, 'PAYMENT_NOT_FOUND', 'Rapyd does not know this payment.');
    const state = fromPayment(payment, input.amount);
    if (state.status === 'refunded') return { ...state, amount: input.amount };
    if (state.status !== 'captured')
      return refused(
        input.amount,
        'PAYMENT_NOT_REFUNDABLE',
        'Only a paid payment can be refunded.',
      );
    const already = moneyOf(payment.refunded_amount);
    const remaining = already ? state.amount.sub(already) : state.amount;
    if (input.amount.gt(remaining))
      return refused(
        input.amount,
        'REFUND_AMOUNT_INVALID',
        'The refund is larger than the payment.',
      );
    const result = await rapydCall(
      ctx,
      'post',
      '/v1/refunds',
      jsonWithAmounts({
        payment: id,
        amount: amountSlot(input.amount),
        reason: (input.reason && input.reason.length > 0 ? input.reason : 'Refund requested').slice(
          0,
          250,
        ),
      }),
      input.idempotencyKey,
    );
    if (!result.ok) return failure(input.amount, result.errorCode);
    return fromRefund(result.data, input.amount);
  },

  async getTransaction(ctx, id) {
    const payment = await loadPayment(ctx, id);
    if (!payment) throw new ValidationError('Rapyd does not know this payment.');
    return fromPayment(payment, null);
  },

  verifyWebhook: (ctx, request) => verifyRapydWebhook(ctx, request),
  parseWebhook: (request) => parseRapydEvent(request.rawBody),
  cardIdentity: (transaction) => transaction.cardIdentity,
  mapDecline: mapRapydDecline,
});
