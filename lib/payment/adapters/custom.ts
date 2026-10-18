// path: lib/payment/adapters/custom.ts
// Custom adapter (docs/processors/custom.md): a generic, configuration-driven adapter for an owner-defined HTTPS
// gateway. Nothing provider-specific is built in. The gateway's session call returns a hosted checkout address; the
// payer pays there and types the payment reference back; this code looks the payment up and verifies it against the
// invoice, and refunds through the configured refund call. Every outbound call goes through the SSRF guard. No card
// data reaches this code.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { buildTransaction, defineAdapter } from '@/lib/payment/adapters/base';
import { validateOutboundUrl } from '@/lib/security/ssrf';
import type { Money } from '@/lib/utils/currency';
import type {
  AdapterContext,
  CredentialField,
  ProcessorAdapter,
  ProcessorTransaction,
} from '@/types/contracts';
import {
  SAFE_ID,
  config,
  customCall,
  pathSetting,
  requestBody,
  setting,
  textAt,
} from './custom/api';
import {
  failure,
  fromLookup,
  fromRefundAnswer,
  mapCustomDecline,
  readLookup,
} from './custom/mapping';
import { parseCustomEvent, verifyCustomWebhook } from './custom/webhook';

export { mapCustomDecline };

function paymentIdOf(value: string): string {
  if (!SAFE_ID.test(value)) throw new ValidationError('Not a valid payment reference.');
  return value;
}

function refused(amount: Money, code: string, message: string): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapCustomDecline({ code, message: null }),
    rawCode: code,
    message,
  });
}

async function lookup(ctx: AdapterContext, id: string): Promise<ProcessorTransaction | null> {
  const result = await customCall(ctx, 'GET', setting(ctx, 'lookupPath'), paymentIdOf(id), null);
  if (result.status !== 200 || !result.body) return null;
  const view = readLookup(ctx, result.body);
  return view.id === null ? null : fromLookup(ctx, view, null);
}

/** Reads the payment back and checks reference, currency and amount before it counts as paid. */
async function verifyPayment(
  ctx: AdapterContext,
  token: string,
  invoiceId: string,
  amount: Money,
): Promise<ProcessorTransaction> {
  const result = await customCall(ctx, 'GET', setting(ctx, 'lookupPath'), paymentIdOf(token), null);
  const view = result.status === 200 && result.body ? readLookup(ctx, result.body) : null;
  if (!view || view.id === null)
    return refused(amount, 'PAYMENT_NOT_FOUND', 'The gateway does not know this payment.');
  if (
    view.reference !== invoiceId.slice(0, 100) ||
    view.currency !== 'USD' ||
    !view.amount ||
    !view.amount.eq(amount)
  )
    return refused(amount, 'PAYMENT_MISMATCH', 'This payment does not belong to this invoice.');
  const transaction = fromLookup(ctx, view, amount);
  return transaction.status === 'captured'
    ? transaction
    : refused(amount, 'PAYMENT_NOT_COMPLETED', 'The payment was not completed.');
}

const path = (key: string, label: string, required: boolean, help: string): CredentialField => ({
  key,
  label,
  secret: false,
  required,
  pattern: '^/[A-Za-z0-9._~/{}-]{0,200}$',
  helpText: help,
});
const dotted = (key: string, label: string, help: string): CredentialField => ({
  key,
  label,
  secret: false,
  required: false,
  pattern: '^[A-Za-z0-9_]{1,60}(\\.[A-Za-z0-9_]{1,60}){0,8}$',
  helpText: help,
});
const wordList = (key: string, label: string, help: string): CredentialField => ({
  key,
  label,
  secret: false,
  required: false,
  pattern: '^[A-Za-z0-9_. -]{1,60}(,[A-Za-z0-9_. -]{1,60}){0,19}$',
  helpText: help,
});

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'custom',
  displayName: 'Custom',
  capabilities: {
    supportsAuthCapture: false,
    supportsThreeDS: false,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: false,
    modes: [{ id: 'hosted_gateway', label: 'Owner-defined hosted gateway', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'baseUrl',
      label: 'Gateway base URL',
      secret: false,
      required: true,
      pattern: '^https://[^\\s]{4,300}$',
      helpText: 'https only, a public host, port 443; a path prefix is allowed.',
    },
    {
      key: 'authScheme',
      label: 'Authentication scheme',
      secret: false,
      required: true,
      pattern: '^(none|bearer|basic|header)$',
      helpText: 'none, bearer, basic (secret is user:password) or header.',
    },
    {
      key: 'authHeaderName',
      label: 'Authentication header name',
      secret: false,
      required: false,
      pattern: '^[A-Za-z0-9-]{1,60}$',
      helpText: 'Only for the header scheme; default X-API-Key.',
    },
    {
      key: 'authSecret',
      label: 'Authentication secret',
      secret: true,
      required: false,
      pattern: '^[\\x21-\\x7E]{1,400}$',
      helpText: 'The token, key or user:password, depending on the scheme.',
    },
    path(
      'testPath',
      'Test path',
      true,
      'GET; must answer 2xx. Required before the processor is enabled.',
    ),
    path('sessionPath', 'Session path', true, 'POST; creates a hosted checkout for an invoice.'),
    path('lookupPath', 'Lookup path', true, 'GET; use {id} for the payment reference.'),
    path('refundPath', 'Refund path', false, 'POST; use {id} for the payment reference.'),
    {
      key: 'amountFormat',
      label: 'Amount format',
      secret: false,
      required: false,
      pattern: '^(decimal_string|decimal_number|minor_number)$',
      helpText: 'decimal_string "120.50" (default), decimal_number 120.5 or minor_number 12050.',
    },
    dotted('fieldAmount', 'Request field: amount', 'Default amount.'),
    dotted('fieldCurrency', 'Request field: currency', 'Default currency.'),
    dotted('fieldReference', 'Request field: reference', 'Default reference.'),
    dotted('fieldReturnUrl', 'Request field: return URL', 'Default return_url.'),
    dotted('fieldReason', 'Request field: refund reason', 'Default reason.'),
    dotted('sessionUrlPath', 'Response path: checkout URL', 'Default checkout_url.'),
    dotted('lookupIdPath', 'Response path: payment id', 'Default id.'),
    dotted('lookupStatusPath', 'Response path: status', 'Default status.'),
    dotted('lookupAmountPath', 'Response path: amount', 'Default amount.'),
    dotted('lookupCurrencyPath', 'Response path: currency', 'Default currency.'),
    dotted(
      'lookupReferencePath',
      'Response path: reference',
      'Default reference; a payment without it is refused.',
    ),
    dotted('lookupCodePath', 'Response path: failure code', 'Optional.'),
    dotted('refundStatusPath', 'Response path: refund status', 'Default status.'),
    wordList('statusPaid', 'Status words: paid', 'Default paid,succeeded.'),
    wordList('statusPending', 'Status words: pending', 'Default pending,processing.'),
    wordList('statusRefunded', 'Status words: refunded', 'Default refunded.'),
    wordList('statusVoided', 'Status words: canceled', 'Default canceled,voided.'),
    wordList('refundDone', 'Refund words: done', 'Default refunded,succeeded,completed.'),
    wordList('refundPending', 'Refund words: pending', 'Default pending,processing.'),
    {
      key: 'webhookSecret',
      label: 'Webhook secret',
      secret: true,
      required: true,
      pattern: '^[\\x21-\\x7E]{8,200}$',
      helpText: 'The shared secret the gateway signs webhooks with.',
    },
    {
      key: 'signatureHeader',
      label: 'Webhook signature header',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9-]{1,60}$',
      helpText: 'Name of the header that carries the signature.',
    },
    {
      key: 'signatureFormat',
      label: 'Webhook signature format',
      secret: false,
      required: false,
      pattern: '^(hmac_sha256_hex|hmac_sha256_base64)$',
      helpText: 'hmac_sha256_hex (default) or hmac_sha256_base64.',
    },
    {
      key: 'timestampHeader',
      label: 'Webhook timestamp header',
      secret: false,
      required: false,
      pattern: '^[A-Za-z0-9-]{1,60}$',
      helpText: 'Optional; the signed text is then <timestamp>.<body>.',
    },
  ],

  async testConnection(ctx) {
    try {
      const result = await customCall(ctx, 'GET', setting(ctx, 'testPath'), null, null);
      if (result.status >= 200 && result.status < 300)
        return {
          ok: true,
          message: 'The gateway answered the test call.',
          details: { mode: ctx.environment },
        };
      return {
        ok: false,
        message: `The gateway answered the test call with status ${result.status}.`,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof ValidationError ? error.message : 'The gateway could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx, input) {
    const cfg = config(ctx);
    if (!input.returnUrl.startsWith('https://'))
      throw new ValidationError('The gateway needs an https return address.');
    const body = requestBody(
      cfg,
      {
        [setting(ctx, 'fieldCurrency', 'currency')]: 'USD',
        [setting(ctx, 'fieldReference', 'reference')]: input.invoiceId.slice(0, 100),
        [setting(ctx, 'fieldReturnUrl', 'return_url')]: input.returnUrl,
      },
      setting(ctx, 'fieldAmount', 'amount'),
      input.amount,
    );
    const result = await customCall(
      ctx,
      'POST',
      setting(ctx, 'sessionPath'),
      null,
      body,
      input.idempotencyKey,
    );
    const address = result.body
      ? textAt(result.body, pathSetting(ctx, 'sessionUrlPath', 'checkout_url'))
      : null;
    if (result.status < 200 || result.status >= 300 || !address)
      throw new ValidationError('The gateway refused to create the checkout.');
    let checkoutUrl: URL;
    try {
      checkoutUrl = validateOutboundUrl(address);
    } catch {
      throw new ValidationError('The gateway returned a checkout address that is not allowed.');
    }
    const host = checkoutUrl.hostname.toLowerCase();
    const baseHost = cfg.base.hostname.toLowerCase();
    if (host !== baseHost && !host.endsWith(`.${baseHost}`))
      throw new ValidationError('The checkout address is not on the gateway host.');
    return { clientConfig: { checkoutUrl: checkoutUrl.toString() }, expiresAt: null };
  },

  async authorize(ctx, input) {
    return verifyPayment(ctx, input.paymentToken, input.invoiceId, input.amount);
  },

  async charge(ctx, input) {
    return verifyPayment(ctx, input.paymentToken, input.invoiceId, input.amount);
  },

  async refund(ctx, input) {
    const id = paymentIdOf(input.processorTransactionId);
    const refundPath = setting(ctx, 'refundPath');
    if (refundPath === '')
      return refused(
        input.amount,
        'REFUND_NOT_CONFIGURED',
        'No refund call is configured for this gateway.',
      );
    const state = await lookup(ctx, id);
    if (!state)
      return refused(input.amount, 'PAYMENT_NOT_FOUND', 'The gateway does not know this payment.');
    if (state.status === 'refunded') return { ...state, amount: input.amount };
    if (state.status !== 'captured')
      return refused(
        input.amount,
        'PAYMENT_NOT_REFUNDABLE',
        'Only a paid payment can be refunded.',
      );
    if (input.amount.gt(state.amount))
      return refused(
        input.amount,
        'REFUND_AMOUNT_INVALID',
        'The refund is larger than the payment.',
      );
    const cfg = config(ctx);
    const result = await customCall(
      ctx,
      'POST',
      refundPath,
      id,
      requestBody(
        cfg,
        {
          [setting(ctx, 'fieldReason', 'reason')]: (input.reason && input.reason.length > 0
            ? input.reason
            : 'Refund requested'
          ).slice(0, 250),
        },
        setting(ctx, 'fieldAmount', 'amount'),
        input.amount,
      ),
      input.idempotencyKey,
    );
    if (result.status < 200 || result.status >= 300) return failure(input.amount, 'REFUSED');
    return fromRefundAnswer(ctx, result.body, input.amount, id);
  },

  async getTransaction(ctx, id) {
    const state = await lookup(ctx, id);
    if (!state) throw new ValidationError('The gateway does not know this payment.');
    return state;
  },

  verifyWebhook: (ctx, request) => verifyCustomWebhook(ctx, request),
  parseWebhook: (request) => parseCustomEvent(request.rawBody),
  cardIdentity: () => null,
  mapDecline: mapCustomDecline,
});
