// path: lib/payment/adapters/payproglobal.ts
// PayPro Global adapter (docs/processors/payproglobal.md): PayPro Global is the merchant of record and sells in one
// step in its own hosted checkout. The server builds an encrypted dynamic checkout link for the invoice; the payer pays
// there and types the order number back; this code reads the order and verifies it against the invoice, and refunds
// through the order API. No card data reaches this code.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { buildTransaction, defineAdapter } from '@/lib/payment/adapters/base';
import type { Money } from '@/lib/utils/currency';
import type { AdapterContext, ProcessorAdapter, ProcessorTransaction } from '@/types/contracts';
import {
  ORDER_ID,
  STORE_BASE,
  amountSlot,
  dynamicSettingsText,
  encryptDynamic,
  payproCall,
  type Json,
} from './payproglobal/api';
import {
  customField,
  failure,
  firstItemId,
  fromOrder,
  fromRefund,
  mapPayproDecline,
  moneyOf,
  orderAmounts,
} from './payproglobal/mapping';
import { parsePayproEvent, verifyPayproWebhook } from './payproglobal/webhook';

export { mapPayproDecline };

const INVOICE_REF = /^[A-Za-z0-9_-]{1,100}$/;
const LINK_VALID_HOURS = 24;

function orderIdOf(value: string): string {
  if (!ORDER_ID.test(value)) throw new ValidationError('Not a PayPro Global order number.');
  return value;
}

function refused(amount: Money, code: string, message: string): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapPayproDecline({ code, message: null }),
    rawCode: code,
    message,
  });
}

/** The order details, or null when PayPro Global does not know the order. */
async function loadOrder(ctx: AdapterContext, id: string): Promise<Json | null> {
  const result = await payproCall(ctx, 'Orders/GetOrderDetails', {
    orderId: +orderIdOf(id),
    dateFormat: 'a',
  });
  return result.ok && result.data ? result.data : null;
}

/** Reads the order and checks it is a processed order of this environment, in USD, for this invoice and amount. */
async function verifyPayment(
  ctx: AdapterContext,
  token: string,
  invoiceId: string,
  amount: Money,
): Promise<ProcessorTransaction> {
  const order = await loadOrder(ctx, token);
  if (!order)
    return refused(amount, 'ORDER_NOT_FOUND', 'PayPro Global does not know this order number.');
  const { price, taxes } = orderAmounts(order);
  const grossMatches = price !== null && taxes !== null && price.add(taxes).eq(amount);
  if (
    order.isTestMode !== (ctx.environment === 'sandbox') ||
    order.billingCurrencyCode !== 'USD' ||
    customField(order, 'KdInvoice') !== invoiceId.slice(0, 100) ||
    !((price && price.eq(amount)) || grossMatches)
  )
    return refused(amount, 'ORDER_MISMATCH', 'This order does not belong to this payment.');
  const result = fromOrder({ ...order, orderId: +token }, amount);
  if (result.status !== 'captured')
    return refused(amount, 'CHECKOUT_NOT_COMPLETED', 'The payment was not completed.');
  // The invoice amount is what the platform books; any tax PayPro Global added on top is its own.
  return { ...result, amount };
}

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'payproglobal',
  displayName: 'PayPro Global',
  capabilities: {
    supportsAuthCapture: false,
    supportsThreeDS: false,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: true,
    modes: [{ id: 'hosted_checkout', label: 'PayPro Global hosted checkout', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'vendorAccountId',
      label: 'Vendor account ID',
      secret: false,
      required: true,
      pattern: '^[0-9]{1,12}$',
      helpText: 'PayPro Global, Account settings, Business info.',
    },
    {
      key: 'apiSecretKey',
      label: 'API secret key',
      secret: true,
      required: true,
      pattern: '^[\\x21-\\x7E]{8,200}$',
      helpText:
        'Store settings, General settings, Integration. PayPro Global support must generate it and whitelist the platform server address.',
    },
    {
      key: 'validationKey',
      label: 'IPN validation key',
      secret: true,
      required: true,
      pattern: '^[\\x21-\\x7E]{4,200}$',
      helpText:
        'Store settings, General settings, Integration: the validation key of the IPN signature.',
    },
    {
      key: 'productId',
      label: 'Product ID',
      secret: false,
      required: true,
      pattern: '^[0-9]{1,12}$',
      helpText:
        'A one-time product with dynamic settings and encryption enabled (Product setup, Pricing configuration).',
    },
    {
      key: 'encryptionKey',
      label: 'Link encryption key',
      secret: true,
      required: true,
      pattern: '^[\\x21-\\x7E]{32}$',
      helpText: 'Exactly 32 characters; the Scramble URL key of the Integration tab.',
    },
    {
      key: 'encryptionIv',
      label: 'Link encryption IV',
      secret: true,
      required: true,
      pattern: '^[\\x21-\\x7E]{16}$',
      helpText: 'Exactly 16 characters; the Scramble URL vector of the Integration tab.',
    },
    {
      key: 'testSecretKey',
      label: 'Test mode secret key',
      secret: true,
      required: false,
      pattern: '^[\\x21-\\x7E]{1,200}$',
      helpText:
        'Only when the account defines a secret key for test links (sandbox environment only).',
    },
  ],

  async testConnection(ctx) {
    try {
      const result = await payproCall(ctx, 'Orders/GetList', {
        skip: 0,
        take: 1,
        search: {},
        includeTestOrders: ctx.environment === 'sandbox',
      });
      if (result.ok)
        return {
          ok: true,
          message: 'PayPro Global accepted the credentials.',
          details: { mode: ctx.environment },
        };
      return {
        ok: false,
        message: 'PayPro Global did not answer as expected for these credentials.',
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof ValidationError ? error.message : 'PayPro Global could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx, input) {
    const productId = ctx.credentials.productId ?? '';
    const key = ctx.credentials.encryptionKey ?? '';
    const iv = ctx.credentials.encryptionIv ?? '';
    if (!/^[0-9]{1,12}$/.test(productId))
      throw new ValidationError('The PayPro Global product id is missing or malformed.');
    const invoiceId = input.invoiceId.slice(0, 100);
    if (!INVOICE_REF.test(invoiceId))
      throw new ValidationError('The invoice reference cannot be used in a checkout link.');
    const expires = new Date(Date.now() + LINK_VALID_HOURS * 3600 * 1000).toISOString();
    const encrypted = encryptDynamic(
      dynamicSettingsText({ invoiceId, amount: input.amount, expiresAtIso: expires }),
      key,
      iv,
    );
    const test = ctx.environment === 'sandbox';
    const testKey = ctx.credentials.testSecretKey ?? '';
    const checkoutUrl =
      `${STORE_BASE}/checkout?products[1][id]=${productId}` +
      `&products[1][data]=${encodeURIComponent(encrypted)}&currency=USD` +
      (test ? '&use-test-mode=true' : '') +
      (test && testKey !== '' ? `&secret-key=${encodeURIComponent(testKey)}` : '');
    return { clientConfig: { checkoutUrl }, expiresAt: expires };
  },

  async authorize(ctx, input) {
    return verifyPayment(ctx, input.paymentToken, input.invoiceId, input.amount);
  },

  async charge(ctx, input) {
    return verifyPayment(ctx, input.paymentToken, input.invoiceId, input.amount);
  },

  async refund(ctx, input) {
    const id = orderIdOf(input.processorTransactionId);
    const order = await loadOrder(ctx, id);
    if (!order)
      return refused(input.amount, 'ORDER_NOT_FOUND', 'PayPro Global does not know this order.');
    const state = fromOrder({ ...order, orderId: +id }, input.amount);
    if (state.status === 'refunded') return { ...state, amount: input.amount };
    if (state.status !== 'captured')
      return refused(
        input.amount,
        'ORDER_NOT_REFUNDABLE',
        'Only a processed order can be refunded.',
      );
    const { price, taxes } = orderAmounts(order);
    const total = price && taxes ? price.add(taxes) : price;
    const already = moneyOf(order.billingRefundedAmount);
    const ceiling = total && already ? total.sub(already) : total;
    if (!ceiling || input.amount.gt(ceiling))
      return refused(input.amount, 'REFUND_AMOUNT_INVALID', 'The refund is larger than the order.');
    const reason = (
      input.reason && input.reason.length > 0 ? input.reason : 'Refund requested'
    ).slice(0, 250);
    const whole = (!already || already.isZero()) && input.amount.eq(ceiling);
    if (whole) {
      const result = await payproCall(ctx, 'Orders/DoRefund', {
        orderIds: [+id],
        refundReason: reason,
      });
      if (!result.ok) return failure(input.amount);
      return fromRefund(result.items[0] ?? null, input.amount, id);
    }
    const itemId = firstItemId(order);
    if (!itemId)
      return refused(input.amount, 'REFUND_ITEM_UNKNOWN', 'PayPro Global did not list the item.');
    const result = await payproCall(ctx, 'Orders/DoPartialRefund', {
      orderItemId: +itemId,
      refundAmount: amountSlot(input.amount),
      changeSubscriptionPrice: false,
      cancelSubscription: false,
      refundReason: reason,
    });
    if (!result.ok) return failure(input.amount);
    return fromRefund(result.data, input.amount, id);
  },

  async getTransaction(ctx, id) {
    const order = await loadOrder(ctx, id);
    if (!order) throw new ValidationError('PayPro Global does not know this order.');
    return fromOrder({ ...order, orderId: +id }, null);
  },

  verifyWebhook: (ctx, request) => verifyPayproWebhook(ctx, request),
  parseWebhook: (request) => parsePayproEvent(request.rawBody),
  cardIdentity: (transaction) => transaction.cardIdentity,
  mapDecline: mapPayproDecline,
});
