// path: lib/payment/adapters/fastspring.ts
// FastSpring adapter (docs/processors/fastspring.md): FastSpring is the merchant of record and sells in one step. The
// server creates a checkout session whose single line item carries the invoice amount as a custom price; the payer pays
// in FastSpring's Checkout Components (card inputs inside FastSpring's frames); this code reads the order back and
// verifies it against the invoice, and refunds through returns. No card data reaches this code.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { buildTransaction, defineAdapter } from '@/lib/payment/adapters/base';
import type { Money } from '@/lib/utils/currency';
import type { AdapterContext, ProcessorAdapter, ProcessorTransaction } from '@/types/contracts';
import {
  CHECKOUT_PATH,
  CHECKOUT_URL,
  ORDER_ID,
  PRODUCT_PATH,
  SDK_URL,
  amountSlot,
  fastspringCall,
  jsonWithAmounts,
  list,
  str,
  type Json,
} from './fastspring/api';
import {
  failure,
  firstReturn,
  fromOrder,
  fromReturn,
  mapFastspringDecline,
  orderAmounts,
} from './fastspring/mapping';
import { parseFastspringEvent, verifyFastspringWebhook } from './fastspring/webhook';

export { mapFastspringDecline };

function orderIdOf(value: string): string {
  if (!ORDER_ID.test(value)) throw new ValidationError('Not a FastSpring order id.');
  return value;
}

function refused(amount: Money, code: string, message: string): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapFastspringDecline({ code, message: null }),
    rawCode: code,
    message,
  });
}

/** The order object of an answer, or null when FastSpring does not know the order. */
async function loadOrder(ctx: AdapterContext, id: string): Promise<Json | null> {
  const result = await fastspringCall(ctx, 'GET', `/orders/${orderIdOf(id)}`, null);
  const order = result.status === 200 ? result.body : null;
  return order && str(order.result) !== 'error' && (str(order.id) || str(order.order))
    ? order
    : null;
}

/** Reads the order back and checks it is a completed order of this environment, in USD, for the invoice amount. */
async function verifyPayment(
  ctx: AdapterContext,
  token: string,
  amount: Money,
): Promise<ProcessorTransaction> {
  const order = await loadOrder(ctx, token);
  if (!order) return refused(amount, 'ORDER_NOT_FOUND', 'FastSpring does not know this order.');
  const { subtotal, total } = orderAmounts(order);
  if (
    order.live !== (ctx.environment === 'live') ||
    order.currency !== 'USD' ||
    !((subtotal && subtotal.eq(amount)) || (total && total.eq(amount)))
  )
    return refused(amount, 'ORDER_MISMATCH', 'This order does not belong to this payment.');
  const result = fromOrder(order, amount);
  if (result.status !== 'captured')
    return refused(
      amount,
      'CHECKOUT_NOT_COMPLETED',
      'The payment was not completed in the checkout.',
    );
  // The invoice amount is what the platform books; any tax FastSpring added on top is its own.
  return { ...result, amount };
}

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'fastspring',
  displayName: 'FastSpring',
  capabilities: {
    supportsAuthCapture: false,
    supportsThreeDS: false,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: true,
    modes: [{ id: 'checkout_components', label: 'Checkout Components', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'username',
      label: 'API username',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9_-]{4,100}$',
      helpText: 'FastSpring app, Developer Tools, APIs: the API credentials username.',
    },
    {
      key: 'password',
      label: 'API password',
      secret: true,
      required: true,
      pattern: '^[A-Za-z0-9_.~+/=-]{8,200}$',
      helpText: 'The password shown once when the API credentials were created.',
    },
    {
      key: 'checkoutPath',
      label: 'Checkout path',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9_-]{1,100}/[A-Za-z0-9_-]{1,100}$',
      helpText: 'The Component Checkout as store-id/checkout-id (for example mystore/main).',
    },
    {
      key: 'checkoutUrl',
      label: 'Checkout URL',
      secret: false,
      required: true,
      pattern: '^https://[a-z0-9-]{1,100}\\.onfastspring\\.com/[A-Za-z0-9_-]{1,100}$',
      helpText:
        'Checkouts, Component Checkouts, your checkout, Implementation: the checkout URL; add the platform origin to its allow list.',
    },
    {
      key: 'productPath',
      label: 'Product path',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9_-]{1,256}$',
      helpText:
        'Path of a catalog product used to carry the invoice price (the session overrides its price).',
    },
    {
      key: 'webhookSecret',
      label: 'Webhook HMAC secret',
      secret: true,
      required: true,
      pattern: '^[\\x21-\\x7E]{8,200}$',
      helpText:
        'Developer Tools, Webhooks: the HMAC SHA256 Secret typed on the webhook for the platform URL.',
    },
  ],

  async testConnection(ctx) {
    try {
      const result = await fastspringCall(ctx, 'GET', '/orders/kd-connection-check', null);
      if (result.status < 500)
        return {
          ok: true,
          message: 'FastSpring accepted the API credentials.',
          details: { mode: ctx.environment },
        };
      return { ok: false, message: 'FastSpring did not answer as expected.' };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof ValidationError ? error.message : 'FastSpring could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx, input) {
    const checkoutPath = ctx.credentials.checkoutPath ?? '';
    const checkoutUrl = ctx.credentials.checkoutUrl ?? '';
    const productPath = ctx.credentials.productPath ?? '';
    if (!CHECKOUT_PATH.test(checkoutPath) || !CHECKOUT_URL.test(checkoutUrl))
      throw new ValidationError('The FastSpring checkout path or URL is missing or malformed.');
    if (!PRODUCT_PATH.test(productPath))
      throw new ValidationError('The FastSpring product path is missing or malformed.');
    const result = await fastspringCall(
      ctx,
      'POST',
      `/v2/checkouts/${checkoutPath}/sessions`,
      jsonWithAmounts({
        live: ctx.environment === 'live',
        orderTags: { invoice_id: input.invoiceId.slice(0, 100) },
        cart: {
          lineItems: [
            {
              productPath,
              quantity: 1,
              customPrice: { unitPrice: { USD: amountSlot(input.amount) } },
            },
          ],
        },
      }),
    );
    const id = str(result.body.id);
    const status = Array.isArray(result.body.checkoutStatus) ? result.body.checkoutStatus : [];
    if (
      result.status !== 201 ||
      !id ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(id) ||
      (status.length > 0 && !status.includes('READY_FOR_CHECKOUT'))
    )
      throw new ValidationError('FastSpring refused to create the checkout session.');
    return {
      clientConfig: { sessionId: id, checkoutUrl, sdkUrl: SDK_URL },
      expiresAt: null,
    };
  },

  async authorize(ctx, input) {
    return verifyPayment(ctx, input.paymentToken, input.amount);
  },

  async charge(ctx, input) {
    return verifyPayment(ctx, input.paymentToken, input.amount);
  },

  async refund(ctx, input) {
    const id = orderIdOf(input.processorTransactionId);
    const order = await loadOrder(ctx, id);
    if (!order)
      return refused(input.amount, 'ORDER_NOT_FOUND', 'FastSpring does not know this order.');
    const state = fromOrder(order, input.amount);
    if (state.status !== 'captured')
      return refused(
        input.amount,
        'ORDER_NOT_REFUNDABLE',
        'Only a completed order can be refunded.',
      );
    const { subtotal, total } = orderAmounts(order);
    const ceiling = total ?? subtotal ?? state.amount;
    if (input.amount.gt(ceiling))
      return refused(input.amount, 'REFUND_AMOUNT_INVALID', 'The refund is larger than the order.');
    const whole = input.amount.eq(ceiling);
    const productPath = ctx.credentials.productPath ?? '';
    if (!whole && !PRODUCT_PATH.test(productPath))
      return refused(input.amount, 'REFUND_ITEM_UNKNOWN', 'The product path is missing.');
    const reason = (
      input.reason && input.reason.length > 0 ? input.reason : 'Refund requested'
    ).slice(0, 250);
    const entry: Json = {
      order: id,
      reason: 'OTHER',
      note: reason,
      notification: 'NONE',
      refundType: whole ? 'FULL' : 'PARTIAL',
      ...(whole ? {} : { items: [{ product: productPath, amount: amountSlot(input.amount) }] }),
    };
    const result = await fastspringCall(
      ctx,
      'POST',
      '/returns',
      jsonWithAmounts({ returns: [entry] }),
    );
    if (result.status >= 400 && list(result.body.returns).length === 0)
      return failure(input.amount);
    return fromReturn(firstReturn(result.body), input.amount);
  },

  async getTransaction(ctx, id) {
    const order = await loadOrder(ctx, id);
    if (!order) throw new ValidationError('FastSpring does not know this order.');
    return fromOrder(order, null);
  },

  verifyWebhook: (ctx, request) => verifyFastspringWebhook(ctx, request),
  parseWebhook: (request) => parseFastspringEvent(request.rawBody),
  cardIdentity: (transaction) => transaction.cardIdentity,
  mapDecline: mapFastspringDecline,
});
