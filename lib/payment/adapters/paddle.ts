// path: lib/payment/adapters/paddle.ts
// Paddle Billing adapter (docs/processors/paddle.md): Paddle is the merchant of record and sells in one step. The server
// creates a one-time transaction for the invoice (a non-catalog price with tax included in the price); the payer pays it
// in Paddle's own checkout (Paddle.js); this code reads the transaction back and verifies it against the invoice, and
// refunds through adjustments. No card data reaches this code.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { buildTransaction, defineAdapter, toMinorUnits } from '@/lib/payment/adapters/base';
import type { Money } from '@/lib/utils/currency';
import type { AdapterContext, ProcessorAdapter, ProcessorTransaction } from '@/types/contracts';
import { obj, paddleCall, str, type Json } from './paddle/api';
import {
  failureFromError,
  firstItemId,
  fromAdjustment,
  fromTransaction,
  grandTotal,
  mapPaddleDecline,
} from './paddle/mapping';
import { parsePaddleEvent, verifyPaddleWebhook } from './paddle/webhook';

export { mapPaddleDecline };

const TRANSACTION_ID = /^txn_[a-z0-9]{20,40}$/;
const CLIENT_TOKEN = /^[A-Za-z0-9_-]{10,200}$/;

function transactionIdOf(value: string): string {
  if (!TRANSACTION_ID.test(value)) throw new ValidationError('Not a Paddle transaction id.');
  return value;
}

function refused(amount: Money, code: string, message: string): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapPaddleDecline({ code, message: null }),
    rawCode: code,
    message,
  });
}

async function loadTransaction(ctx: AdapterContext, id: string): Promise<Json | null> {
  const result = await paddleCall(ctx, 'GET', `/transactions/${transactionIdOf(id)}`, null);
  return result.status === 200 && result.data && str(result.data.id) ? result.data : null;
}

/** Reads the transaction back and checks it belongs to this invoice and amount. Used by `authorize` and `charge`. */
async function verifyPayment(
  ctx: AdapterContext,
  token: string,
  invoiceId: string,
  amount: Money,
): Promise<ProcessorTransaction> {
  const transaction = await loadTransaction(ctx, token);
  if (!transaction)
    return refused(amount, 'TRANSACTION_NOT_FOUND', 'Paddle does not know this transaction.');
  const custom = obj(transaction.custom_data);
  const total = grandTotal(transaction);
  if (
    str(custom?.invoice_id) !== invoiceId.slice(0, 100) ||
    transaction.currency_code !== 'USD' ||
    !total ||
    !total.eq(amount)
  )
    return refused(
      amount,
      'TRANSACTION_MISMATCH',
      'This transaction does not belong to this payment.',
    );
  const result = fromTransaction(transaction, amount);
  return result.status === 'pending'
    ? refused(amount, 'CHECKOUT_NOT_COMPLETED', 'The payment was not completed in the checkout.')
    : result;
}

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'paddle',
  displayName: 'Paddle',
  capabilities: {
    supportsAuthCapture: false,
    supportsThreeDS: false,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: true,
    modes: [{ id: 'paddle_checkout', label: 'Paddle Checkout (Paddle.js)', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'apiKey',
      label: 'API key',
      secret: true,
      required: true,
      pattern: '^[A-Za-z0-9_]{20,200}$',
      helpText:
        'Paddle, Developer Tools, Authentication: a key with transaction and adjustment read and write permissions (a sandbox key for the sandbox).',
    },
    {
      key: 'clientToken',
      label: 'Client-side token',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9_-]{10,200}$',
      helpText:
        'Paddle, Developer Tools, Authentication, Client-side tokens: the public token for Paddle.js.',
    },
    {
      key: 'webhookSecret',
      label: 'Notification secret key',
      secret: true,
      required: true,
      pattern: '^pdl_ntfset_[A-Za-z0-9_]{10,200}$',
      helpText:
        'Paddle, Developer Tools, Notifications: the secret key of the destination for the platform URL.',
    },
  ],

  async testConnection(ctx) {
    try {
      const result = await paddleCall(ctx, 'GET', '/transactions?per_page=1', null);
      if (result.status === 200)
        return {
          ok: true,
          message: 'Paddle accepted the API key.',
          details: { mode: ctx.environment },
        };
      return { ok: false, message: 'Paddle did not answer as expected for this key.' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof ValidationError ? error.message : 'Paddle could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx, input) {
    const clientToken = ctx.credentials.clientToken ?? '';
    if (!CLIENT_TOKEN.test(clientToken))
      throw new ValidationError('The Paddle client-side token is missing or malformed.');
    const reference = input.invoiceId.slice(0, 100);
    const result = await paddleCall(ctx, 'POST', '/transactions', {
      items: [
        {
          quantity: 1,
          price: {
            description: `Invoice ${reference}`.slice(0, 500),
            name: 'Invoice payment',
            // Tax is part of the price, so the payer owes exactly the invoice amount (docs section 5).
            tax_mode: 'internal',
            unit_price: { amount: toMinorUnits(input.amount), currency_code: 'USD' },
            product: { name: 'Invoice payment', tax_category: 'standard' },
          },
        },
      ],
      currency_code: 'USD',
      collection_mode: 'automatic',
      custom_data: { invoice_id: reference, company_id: input.companyId.slice(0, 100) },
    });
    const id = result.data ? str(result.data.id) : null;
    if (result.status !== 201 || !id || !TRANSACTION_ID.test(id))
      throw new ValidationError(
        `Paddle refused to create the transaction${result.errorCode ? ` (${result.errorCode})` : ''}.`,
      );
    return {
      clientConfig: { transactionId: id, clientToken, environment: ctx.environment },
      expiresAt: null,
    };
  },

  async authorize(ctx, input) {
    return verifyPayment(ctx, input.paymentToken, input.invoiceId, input.amount);
  },

  async charge(ctx, input) {
    return verifyPayment(ctx, input.paymentToken, input.invoiceId, input.amount);
  },

  async refund(ctx, input) {
    const id = transactionIdOf(input.processorTransactionId);
    const transaction = await loadTransaction(ctx, id);
    if (!transaction)
      return refused(
        input.amount,
        'TRANSACTION_NOT_FOUND',
        'Paddle does not know this transaction.',
      );
    const state = fromTransaction(transaction, input.amount);
    if (state.status !== 'captured')
      return refused(
        input.amount,
        'TRANSACTION_NOT_REFUNDABLE',
        'Only a completed transaction can be refunded.',
      );
    if (input.amount.gt(state.amount))
      return refused(
        input.amount,
        'REFUND_AMOUNT_INVALID',
        'The refund is larger than the payment.',
      );
    const whole = input.amount.eq(state.amount);
    const itemId = firstItemId(transaction);
    if (!whole && !itemId)
      return refused(
        input.amount,
        'REFUND_ITEM_UNKNOWN',
        'Paddle did not list the item to refund.',
      );
    const reason = (
      input.reason && input.reason.length > 0 ? input.reason : 'Refund requested'
    ).slice(0, 250);
    const result = await paddleCall(ctx, 'POST', '/adjustments', {
      action: 'refund',
      transaction_id: id,
      reason,
      type: whole ? 'full' : 'partial',
      ...(whole
        ? {}
        : { items: [{ item_id: itemId, type: 'partial', amount: toMinorUnits(input.amount) }] }),
    });
    if (result.status !== 201 || !result.data)
      return failureFromError(result.errorCode, input.amount);
    return fromAdjustment(result.data, input.amount);
  },

  async getTransaction(ctx, id) {
    const transaction = await loadTransaction(ctx, id);
    if (!transaction) throw new ValidationError('Paddle does not know this transaction.');
    return fromTransaction(transaction, null);
  },

  verifyWebhook: (ctx, request) => verifyPaddleWebhook(ctx, request),
  parseWebhook: (request) => parsePaddleEvent(request.rawBody),
  cardIdentity: (transaction) => transaction.cardIdentity,
  mapDecline: mapPaddleDecline,
});
