// path: lib/payment/adapters/paypal.ts
// PayPal adapter (docs/processors/paypal.md): Orders v2 with Card Fields. The server creates an AUTHORIZE order, the
// browser attaches the card to it inside PayPal's hosted fields (3D Secure included), and the approved order id comes
// back as the payment token. No card data reaches this code.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { buildTransaction, defineAdapter, toMinorUnits } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type {
  AdapterContext,
  ProcessorAdapter,
  ProcessorTransaction,
  ThreeDSPolicy,
} from '@/types/contracts';
import { browserToken, errorIssue, obj, paypalCall, sdkUrl, str, type Json } from './paypal/api';
import {
  failureFromError,
  fromOrder,
  mapPaypalDecline,
  readAuthentication,
  readOrder,
  type OrderView,
} from './paypal/mapping';
import { parsePaypalEvent, verifyPaypalWebhook } from './paypal/webhook';

export { mapPaypalDecline };

const ORDER_ID = /^[A-Z0-9]{10,20}$/;
const VERIFICATION: Readonly<Record<ThreeDSPolicy, string>> = {
  preferred: 'SCA_ALWAYS',
  required: 'SCA_ALWAYS',
  disabled: 'SCA_WHEN_REQUIRED',
};

/** Decimal text with two places ("120.50") as PayPal expects for USD. */
export function paypalValue(amount: Money): string {
  const cents = toMinorUnits(amount).padStart(3, '0');
  return `${cents.slice(0, -2)}.${cents.slice(-2)}`;
}

function moneyBody(amount: Money): Json {
  return { currency_code: 'USD', value: paypalValue(amount) };
}

function orderIdOf(value: string): string {
  if (!ORDER_ID.test(value)) throw new ValidationError('Not a PayPal order id.');
  return value;
}

async function loadOrder(
  ctx: AdapterContext,
  id: string,
): Promise<{ status: number; view: OrderView; body: Json }> {
  const result = await paypalCall(ctx, 'GET', `/v2/checkout/orders/${orderIdOf(id)}`, null, null);
  return { status: result.status, view: readOrder(result.body), body: result.body };
}

function refusal(amount: Money, code: string, message: string): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapPaypalDecline({ code, message: null }),
    rawCode: code,
    message,
  });
}

async function authorize(
  ctx: AdapterContext,
  input: Parameters<ProcessorAdapter['authorize']>[1],
): Promise<ProcessorTransaction> {
  const requested = input.threeDS !== 'disabled';
  const id = orderIdOf(input.paymentToken);
  const loaded = await loadOrder(ctx, id);
  if (loaded.status === 404)
    return refusal(input.amount, 'ORDER_NOT_APPROVED', 'PayPal does not know this order.');
  const view = loaded.view;
  // The browser only names an order; the amount, currency and invoice must be the ones the server put on it.
  if (
    view.currency !== 'USD' ||
    !view.amount ||
    !view.amount.eq(input.amount) ||
    view.customId !== input.invoiceId
  ) {
    return refusal(input.amount, 'ORDER_MISMATCH', 'The order does not match this payment.');
  }
  if (view.authorization || view.status === 'COMPLETED')
    return fromOrder(view, requested, input.amount);
  if (view.status === 'PAYER_ACTION_REQUIRED') return fromOrder(view, requested, input.amount);
  if (view.status !== 'APPROVED')
    return refusal(input.amount, 'ORDER_NOT_APPROVED', 'The payer did not finish the card step.');
  const reading = readAuthentication(view.card, requested);
  if (!reading.mayContinue) {
    return buildTransaction({
      status: 'declined',
      amount: input.amount,
      declineCategory: 'three_ds_failed',
      rawCode: 'authentication_not_continued',
      message: 'The card authentication did not allow the payment to continue.',
      threeDS: reading.result,
      cardIdentity: fromOrder(view, requested, input.amount).cardIdentity,
    });
  }
  const result = await paypalCall(
    ctx,
    'POST',
    `/v2/checkout/orders/${id}/authorize`,
    {},
    input.idempotencyKey,
  );
  if (result.status === 200 || result.status === 201) {
    const after = readOrder(result.body);
    return fromOrder({ ...after, card: after.card ?? view.card }, requested, input.amount);
  }
  if (errorIssue(result.body) === 'ORDER_ALREADY_AUTHORIZED') {
    return fromOrder((await loadOrder(ctx, id)).view, requested, input.amount);
  }
  const failed = failureFromError(result.status, result.body, input.amount);
  return {
    ...failed,
    threeDS: reading.result,
    cardIdentity: fromOrder(view, requested, input.amount).cardIdentity,
  };
}

async function authorizationId(
  ctx: AdapterContext,
  orderId: string,
): Promise<{ id: string; view: OrderView } | null> {
  const { view } = await loadOrder(ctx, orderId);
  const id = str(view.authorization?.id);
  return id ? { id, view } : null;
}

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'paypal',
  displayName: 'PayPal',
  capabilities: {
    supportsAuthCapture: true,
    supportsThreeDS: true,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: false,
    modes: [{ id: 'default', label: 'Card Fields', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'clientId',
      label: 'Client ID',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9_-]{20,120}$',
      helpText:
        'From the REST app in the PayPal developer dashboard (sandbox app for the sandbox environment).',
    },
    {
      key: 'clientSecret',
      label: 'Client secret',
      secret: true,
      required: true,
      pattern: '^[A-Za-z0-9_-]{20,200}$',
      helpText: 'The secret of the same REST app.',
    },
    {
      key: 'webhookId',
      label: 'Webhook ID',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9]{10,40}$',
      helpText:
        'The id shown after you subscribe the webhook URL of this platform to payment events.',
    },
  ],

  async testConnection(ctx) {
    try {
      const result = await paypalCall(
        ctx,
        'GET',
        `/v1/notifications/webhooks/${encodeURIComponent(ctx.credentials.webhookId ?? '')}`,
        null,
        null,
      );
      if (result.status === 200)
        return {
          ok: true,
          message: 'PayPal accepted the credentials and the webhook id.',
          details: { mode: ctx.environment },
        };
      if (result.status === 404)
        return {
          ok: false,
          message:
            'PayPal accepted the credentials, but this webhook id does not belong to the app.',
        };
      return { ok: false, message: 'PayPal did not accept the request.' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof ValidationError ? error.message : 'PayPal could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx, input) {
    const result = await paypalCall(
      ctx,
      'POST',
      '/v2/checkout/orders',
      {
        intent: 'AUTHORIZE',
        purchase_units: [
          { reference_id: 'default', custom_id: input.invoiceId, amount: moneyBody(input.amount) },
        ],
        payment_source: {
          card: {
            attributes: { verification: { method: VERIFICATION[input.threeDS] } },
            experience_context: { return_url: input.returnUrl, cancel_url: input.returnUrl },
          },
        },
      },
      input.idempotencyKey,
    );
    const orderId = str(result.body.id);
    if (!(result.status === 200 || result.status === 201) || !orderId) {
      throw new Error(`paypal order not created (${result.status})`);
    }
    return {
      clientConfig: {
        clientToken: await browserToken(ctx),
        orderId,
        sdkUrl: sdkUrl(ctx.environment),
        environment: ctx.environment,
      },
      // An order stays usable for 3 hours after creation (docs/processors/paypal.md section 5).
      expiresAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
    };
  },

  authorize,

  async capture(ctx, input) {
    const found = await authorizationId(ctx, input.processorTransactionId);
    if (!found)
      return refusal(
        input.amount,
        'AUTHORIZATION_NOT_FOUND',
        'No authorization exists for this order.',
      );
    const result = await paypalCall(
      ctx,
      'POST',
      `/v2/payments/authorizations/${encodeURIComponent(found.id)}/capture`,
      { amount: moneyBody(input.amount), final_capture: true },
      input.idempotencyKey,
    );
    if (result.status === 200 || result.status === 201) {
      const state = str(result.body.status);
      const response = obj(result.body.processor_response);
      const base = { amount: input.amount, processorTransactionId: input.processorTransactionId };
      if (state === 'COMPLETED') return buildTransaction({ status: 'captured', ...base });
      if (state === 'PENDING') return buildTransaction({ status: 'pending', ...base });
      const code = str(response?.response_code);
      return buildTransaction({
        status: 'declined',
        ...base,
        declineCategory: mapPaypalDecline({ code, message: null }),
        rawCode: code,
      });
    }
    return failureFromError(result.status, result.body, input.amount);
  },

  async voidAuthorization(ctx, input) {
    const found = await authorizationId(ctx, input.processorTransactionId);
    const zero = Money.zero();
    if (!found)
      return refusal(zero, 'AUTHORIZATION_NOT_FOUND', 'No authorization exists for this order.');
    const result = await paypalCall(
      ctx,
      'POST',
      `/v2/payments/authorizations/${encodeURIComponent(found.id)}/void`,
      {},
      input.idempotencyKey,
    );
    if (
      result.status === 200 ||
      result.status === 204 ||
      errorIssue(result.body) === 'AUTHORIZATION_VOIDED'
    ) {
      return buildTransaction({
        status: 'voided',
        amount: zero,
        processorTransactionId: input.processorTransactionId,
      });
    }
    return failureFromError(result.status, result.body, zero);
  },

  async refund(ctx, input) {
    const { view } = await loadOrder(ctx, input.processorTransactionId);
    const captureId = str(view.capture?.id);
    if (!captureId)
      return refusal(
        input.amount,
        'CAPTURE_NOT_FOUND',
        'No captured payment exists for this order.',
      );
    const result = await paypalCall(
      ctx,
      'POST',
      `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
      {
        amount: moneyBody(input.amount),
        ...(input.reason ? { note_to_payer: input.reason.slice(0, 255) } : {}),
      },
      input.idempotencyKey,
    );
    if (result.status === 200 || result.status === 201) {
      const state = str(result.body.status);
      return buildTransaction({
        status: state === 'COMPLETED' ? 'refunded' : state === 'PENDING' ? 'pending' : 'declined',
        amount: input.amount,
        processorTransactionId: input.processorTransactionId,
        declineCategory: state === 'FAILED' || state === 'CANCELLED' ? 'processor_error' : null,
        rawCode: str(obj(result.body.status_details)?.reason),
      });
    }
    return failureFromError(result.status, result.body, input.amount);
  },

  async getTransaction(ctx, id) {
    const loaded = await loadOrder(ctx, id);
    if (loaded.status === 404) throw new ValidationError('PayPal does not know this order.');
    return fromOrder(loaded.view, true, null);
  },

  verifyWebhook: (ctx, request) => verifyPaypalWebhook(ctx, request, Date.now()),
  parseWebhook: (request) => parsePaypalEvent(request.rawBody),
  cardIdentity: (transaction) => transaction.cardIdentity,
  mapDecline: mapPaypalDecline,
});
