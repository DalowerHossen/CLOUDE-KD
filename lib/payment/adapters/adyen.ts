// path: lib/payment/adapters/adyen.ts
// Adyen adapter (docs/processors/adyen.md): Sessions flow with Web Drop-in (cards only, immediate capture). The server
// creates a session for the invoice; the payer pays inside Drop-in; this code reads the session result back with the
// value the browser reports and verifies it against the invoice, and refunds through the modification API. Adyen has
// no call that reads a payment back by its reference, so `getTransaction` is not available (docs section 5). No card
// data reaches this code.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { buildTransaction, defineAdapter, toMinorUnits } from '@/lib/payment/adapters/base';
import type { Money } from '@/lib/utils/currency';
import type { AdapterContext, ProcessorAdapter, ProcessorTransaction } from '@/types/contracts';
import {
  CDN_HOSTS,
  PSP_REFERENCE,
  SESSION_ID,
  SESSION_RESULT,
  WEB_CSS_INTEGRITY,
  WEB_JS_INTEGRITY,
  WEB_VERSION,
  adyenCall,
  obj,
  str,
} from './adyen/api';
import {
  authorisedPayment,
  cardIdentity,
  centsOf,
  failure,
  fromRefundAnswer,
  mapAdyenDecline,
} from './adyen/mapping';
import { parseAdyenEvent, verifyAdyenWebhook } from './adyen/webhook';

export { mapAdyenDecline };

/** Splits the browser token `<sessionId>.<sessionResult>`. */
function splitToken(token: string): { id: string; result: string } {
  const dot = token.indexOf('.');
  const id = dot < 0 ? '' : token.slice(0, dot);
  const result = dot < 0 ? '' : token.slice(dot + 1);
  if (!SESSION_ID.test(id) || !SESSION_RESULT.test(result))
    throw new ValidationError('Not an Adyen payment token.');
  return { id, result };
}

function refused(amount: Money, code: string, message: string): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapAdyenDecline({ code, message: null }),
    rawCode: code,
    message,
  });
}

/** Reads the session result and checks it is a completed payment of this invoice and amount. */
async function verifyPayment(
  ctx: AdapterContext,
  token: string,
  invoiceId: string,
  amount: Money,
): Promise<ProcessorTransaction> {
  const { id, result } = splitToken(token);
  const answer = await adyenCall(
    ctx,
    'GET',
    `/sessions/${id}?sessionResult=${encodeURIComponent(result)}`,
    null,
  );
  if (answer.status !== 200 || str(answer.body.id) !== id)
    return refused(amount, 'SESSION_NOT_FOUND', 'Adyen does not know this payment session.');
  const payment = authorisedPayment(answer.body);
  const paid = centsOf(obj(payment?.amount)?.value);
  if (
    str(answer.body.reference) !== invoiceId ||
    !payment ||
    obj(payment.amount)?.currency !== 'USD' ||
    !paid ||
    !paid.eq(amount) ||
    !PSP_REFERENCE.test(str(payment.pspReference) ?? '')
  )
    return refused(
      amount,
      str(answer.body.reference) !== invoiceId ? 'SESSION_MISMATCH' : 'PAYMENT_NOT_COMPLETED',
      'This payment does not belong to this invoice or was not completed.',
    );
  if (str(answer.body.status) !== 'completed')
    return refused(amount, 'PAYMENT_NOT_COMPLETED', 'The payment was not completed.');
  // Adyen captures an authorised card payment at once by default; a failed capture arrives as a webhook.
  return buildTransaction({
    status: 'captured',
    amount,
    processorTransactionId: str(payment.pspReference),
    cardIdentity: cardIdentity(answer.body, payment),
    rawCode: str(payment.resultCode),
  });
}

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'adyen',
  displayName: 'Adyen',
  capabilities: {
    supportsAuthCapture: false,
    supportsThreeDS: false,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: false,
    modes: [{ id: 'web_dropin', label: 'Web Drop-in (cards)', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'apiKey',
      label: 'API key',
      secret: true,
      required: true,
      pattern: '^[A-Za-z0-9._~+/=-]{16,300}$',
      helpText:
        'Customer Area, Developers, API credentials: a key with the Checkout and modification roles.',
    },
    {
      key: 'clientKey',
      label: 'Client key',
      secret: false,
      required: true,
      pattern: '^(test|live)_[A-Za-z0-9]{10,100}$',
      helpText:
        'The client key of the same credential; add the platform origin to its allowed origins.',
    },
    {
      key: 'merchantAccount',
      label: 'Merchant account',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9_-]{2,100}$',
      helpText: 'The merchant account that processes the payments.',
    },
    {
      key: 'hmacKey',
      label: 'Webhook HMAC key',
      secret: true,
      required: true,
      pattern: '^([0-9A-Fa-f]{2}){16,64}$',
      helpText:
        'Developers, Webhooks: the HMAC key (hexadecimal) of the standard webhook for the platform URL.',
    },
    {
      key: 'countryCode',
      label: 'Country code',
      secret: false,
      required: true,
      pattern: '^[A-Z]{2}$',
      helpText: 'Two-letter country used to choose the available card methods.',
    },
    {
      key: 'livePrefix',
      label: 'Live URL prefix',
      secret: false,
      required: false,
      pattern: '^[A-Za-z0-9-]{8,100}$',
      helpText: 'Developers, API URLs, Prefix. Required for the live environment only.',
    },
  ],

  async testConnection(ctx) {
    try {
      const probe = await adyenCall(
        ctx,
        'GET',
        '/sessions/CSKDCONNECTIONCHECK?sessionResult=kdconnectioncheck',
        null,
      );
      if (probe.status < 500)
        return {
          ok: true,
          message: 'Adyen accepted the API key.',
          details: { mode: ctx.environment },
        };
      return { ok: false, message: 'Adyen did not answer as expected.' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof ValidationError ? error.message : 'Adyen could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx, input) {
    const clientKey = ctx.credentials.clientKey ?? '';
    const merchantAccount = ctx.credentials.merchantAccount ?? '';
    const country = ctx.credentials.countryCode ?? '';
    if (
      !/^(test|live)_[A-Za-z0-9]{10,100}$/.test(clientKey) ||
      merchantAccount === '' ||
      !/^[A-Z]{2}$/.test(country)
    )
      throw new ValidationError(
        'The Adyen client key, merchant account or country code is missing or malformed.',
      );
    if (!input.returnUrl.startsWith('https://'))
      throw new ValidationError('Adyen needs an https return address.');
    const value = +toMinorUnits(input.amount);
    const result = await adyenCall(
      ctx,
      'POST',
      '/sessions',
      JSON.stringify({
        merchantAccount,
        amount: { value, currency: 'USD' },
        reference: input.invoiceId.slice(0, 80),
        returnUrl: input.returnUrl,
        countryCode: country,
        channel: 'Web',
        allowedPaymentMethods: ['scheme'],
        authenticationData: { threeDSRequestData: { nativeThreeDS: 'disabled' } },
        metadata: { invoice_id: input.invoiceId.slice(0, 80) },
      }),
      input.idempotencyKey,
    );
    const id = str(result.body.id);
    const data = str(result.body.sessionData);
    if (result.status !== 201 || !id || !data || !SESSION_ID.test(id))
      throw new ValidationError(
        `Adyen refused to create the session${str(result.body.errorCode) ? ` (${str(result.body.errorCode)})` : ''}.`,
      );
    const cdn = CDN_HOSTS[ctx.environment];
    return {
      clientConfig: {
        sessionId: id,
        sessionData: data,
        clientKey,
        environment: ctx.environment === 'live' ? 'live' : 'test',
        countryCode: country,
        amount: String(value),
        scriptUrl: `${cdn}/checkoutshopper/sdk/${WEB_VERSION}/adyen.js`,
        scriptIntegrity: WEB_JS_INTEGRITY,
        styleUrl: `${cdn}/checkoutshopper/sdk/${WEB_VERSION}/adyen.css`,
        styleIntegrity: WEB_CSS_INTEGRITY,
      },
      expiresAt: str(result.body.expiresAt),
    };
  },

  async authorize(ctx, input) {
    return verifyPayment(ctx, input.paymentToken, input.invoiceId, input.amount);
  },

  async charge(ctx, input) {
    return verifyPayment(ctx, input.paymentToken, input.invoiceId, input.amount);
  },

  async refund(ctx, input) {
    if (!PSP_REFERENCE.test(input.processorTransactionId))
      throw new ValidationError('Not an Adyen payment reference.');
    const merchantAccount = ctx.credentials.merchantAccount ?? '';
    if (merchantAccount === '') throw new ValidationError('The Adyen merchant account is missing.');
    const result = await adyenCall(
      ctx,
      'POST',
      `/payments/${input.processorTransactionId}/refunds`,
      JSON.stringify({
        merchantAccount,
        amount: { value: +toMinorUnits(input.amount), currency: 'USD' },
        reference: `refund-${input.idempotencyKey}`.slice(0, 80),
      }),
      input.idempotencyKey,
    );
    if (result.status !== 201) return failure(input.amount, str(result.body.errorCode));
    return fromRefundAnswer(result.body, input.amount);
  },

  async getTransaction() {
    throw new ValidationError(
      'Adyen has no call that reads a payment back; the outcome comes from the session result and webhooks.',
    );
  },

  verifyWebhook: (ctx, request) => verifyAdyenWebhook(ctx, request),
  parseWebhook: (request) => parseAdyenEvent(request.rawBody),
  cardIdentity: (transaction) => transaction.cardIdentity,
  mapDecline: mapAdyenDecline,
});
