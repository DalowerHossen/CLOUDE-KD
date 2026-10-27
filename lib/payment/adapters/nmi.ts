// path: lib/payment/adapters/nmi.ts
// NMI adapter (docs/processors/nmi.md): two front-end modes, one server module. Collect.js and the Payment Component
// both hand over a single-use payment token; every payment, capture, void and refund is sent from
// `nmi/shared-server.ts` to the NMI REST API (v5). No card data reaches this code.
import 'server-only';
import { isIP } from 'node:net';
import { ValidationError } from '@/lib/errors';
import { buildTransaction, defineAdapter } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, ProcessorAdapter, ProcessorTransaction } from '@/types/contracts';
import { failureFromError, fromPayment, mapNmiDecline, moneyOf } from './nmi/mapping';
import {
  COLLECTJS_SCRIPT_URL,
  NMI_SCRIPT_URLS,
  authPath,
  jsonWithAmounts,
  nmiCall,
  paymentPath,
  str,
  type Json,
} from './nmi/shared-server';
import { parseNmiEvent, verifyNmiWebhook } from './nmi/webhook';

export { mapNmiDecline };

const TOKEN = /^[A-Za-z0-9-]{16,80}$/;
const PAYMENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TOKENIZATION_KEY = /^[A-Za-z0-9-]{16,64}$/;
const MODE_IDS: ReadonlySet<string> = new Set(['collectjs', 'payment_component']);

function paymentIdOf(value: string): string {
  if (!PAYMENT_ID.test(value)) throw new ValidationError('Not an NMI payment id.');
  return value;
}

function refused(amount: Money, code: string, message: string): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapNmiDecline({ code, message: null }),
    rawCode: code,
    message,
  });
}

async function loadPayment(ctx: AdapterContext, id: string): Promise<Json | null> {
  const result = await nmiCall(ctx, 'GET', paymentPath(paymentIdOf(id)), null);
  return result.status === 200 && str(result.body.id) ? result.body : null;
}

function requireTokenizationKey(ctx: AdapterContext): string {
  const key = ctx.credentials.tokenizationKey ?? '';
  if (!TOKENIZATION_KEY.test(key))
    throw new ValidationError('The NMI tokenization (public) key is missing or malformed.');
  return key;
}

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'nmi',
  displayName: 'NMI',
  capabilities: {
    supportsAuthCapture: true,
    supportsThreeDS: false,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: false,
    modes: [
      { id: 'collectjs', label: 'Collect.js', isDefault: true },
      { id: 'payment_component', label: 'Payment Component', isDefault: false },
    ],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'privateKey',
      label: 'Private security key',
      secret: true,
      required: true,
      pattern: '^[A-Za-z0-9._~+/=-]{16,200}$',
      helpText:
        'NMI "My Keys", box "Merchant Keys": the key with the permission "api (Payment and Query APIs)" and sensitivity "private". Use the sandbox key for the sandbox.',
    },
    {
      key: 'tokenizationKey',
      label: 'Tokenization (public) key',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9-]{16,64}$',
      helpText:
        'NMI "My Keys", box "Merchant Keys": the key with the permission "tokenization (payment component)" and sensitivity "public". The payer\'s browser uses it to make a payment token.',
    },
    {
      key: 'webhookSigningKey',
      label: 'Webhook signing key',
      secret: true,
      required: true,
      pattern: '^[A-Za-z0-9._~+/=-]{8,200}$',
      helpText:
        'NMI Merchant Portal, Settings, Webhooks: the signing key shown on that page. Create a webhook there that points to this platform at /api/webhooks/nmi.',
    },
    {
      key: 'liveApiBase',
      label: 'Live API address (live accounts only)',
      secret: false,
      required: false,
      pattern: '^https://([a-z0-9-]+\\.)+(nmi|networkmerchants)\\.com/api$',
      helpText:
        'The address of the NMI REST API for live payments, as NMI gave it to you (it ends in /api). Leave empty for the sandbox.',
    },
    {
      key: 'partnerClientId',
      label: 'Partner OAuth2 client ID (merchant sign-up)',
      secret: false,
      required: false,
      pattern: '^[A-Za-z0-9._~+/=-]{8,100}$',
      helpText:
        'NMI "My Keys", box "Partner OAuth2 Apps" (API: Sign-Up), column Client ID. Needed only to onboard sub-merchants from Payment processors, Merchant applications.',
    },
    {
      key: 'partnerClientSecret',
      label: 'Partner OAuth2 client secret (merchant sign-up)',
      secret: true,
      required: false,
      pattern: '^[A-Za-z0-9._~+/=-]{8,100}$',
      helpText: 'NMI "My Keys", box "Partner OAuth2 Apps" (API: Sign-Up), column Client Secret.',
    },
    {
      key: 'partnerWebhookSecret',
      label: 'Sign-up webhook secret (merchant sign-up)',
      secret: true,
      required: false,
      pattern: '^[A-Za-z0-9._~+/=-]{6,64}$',
      helpText:
        'A secret you choose (6 to 64 characters). The platform gives it to NMI when it subscribes to application events and uses it to check each delivery.',
    },
  ],

  async testConnection(ctx) {
    try {
      if (!MODE_IDS.has(ctx.mode)) return { ok: false, message: 'Unknown NMI mode.' };
      requireTokenizationKey(ctx);
      // A payment id that cannot exist: an accepted key answers "not found" (or a format error), a refused key 401.
      const probe = await nmiCall(ctx, 'GET', paymentPath('kd-connection-check'), null);
      if (probe.status !== 404 && probe.status !== 400 && probe.status !== 200)
        return { ok: false, message: 'NMI did not answer as expected for this key.' };
      return {
        ok: true,
        message: 'NMI accepted the private key and the tokenization key is present.',
        details: { mode: ctx.mode, environment: ctx.environment },
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof ValidationError ? error.message : 'NMI could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx) {
    if (!MODE_IDS.has(ctx.mode)) throw new ValidationError('Unknown NMI mode.');
    const tokenizationKey = requireTokenizationKey(ctx);
    if (ctx.mode === 'collectjs')
      return {
        clientConfig: { tokenizationKey, mode: ctx.mode, scriptUrl: COLLECTJS_SCRIPT_URL },
        expiresAt: null,
      };
    const scriptUrl = NMI_SCRIPT_URLS[ctx.environment];
    if (!scriptUrl)
      throw new ValidationError(
        'The NMI browser scripts for live payments are not available yet (see the STEP 12 blockers).',
      );
    return {
      clientConfig: { tokenizationKey, mode: ctx.mode, scriptUrl },
      expiresAt: null,
    };
  },

  async authorize(ctx, input) {
    if (!TOKEN.test(input.paymentToken)) throw new ValidationError('Not an NMI payment token.');
    const billing: Json = {
      ...(input.billing.postalCode ? { zip: input.billing.postalCode } : {}),
      ...(input.billing.country ? { country: input.billing.country } : {}),
    };
    const payload: Json = {
      currency: 'USD',
      payment_details: { payment_token: input.paymentToken },
      ...(Object.keys(billing).length > 0 ? { billing_address: billing } : {}),
      order_details: {
        order_id: input.invoiceId.slice(0, 64),
        ...(isIP(input.payerIp) ? { ip_address: input.payerIp } : {}),
      },
    };
    const result = await nmiCall(
      ctx,
      'POST',
      authPath,
      jsonWithAmounts(payload, { amount: input.amount }),
    );
    if (!str(result.body.id) || str(result.body.response) === null)
      return failureFromError(result.body, input.amount);
    const mapped = fromPayment(
      result.body,
      input.amount,
      str(result.body.response) === '1' ? 'authorized' : null,
    );
    if (mapped.status !== 'authorized' || mapped.amount.eq(input.amount)) return mapped;
    // The held amount differs from the invoice: release it and refuse.
    try {
      await nmiCall(ctx, 'POST', `${paymentPath(String(result.body.id))}/void`, '{}');
    } catch {
      // The refusal below stands; the hold lapses at the issuer.
    }
    return refused(
      input.amount,
      'AMOUNT_MISMATCH',
      'The authorized amount differs from the invoice.',
    );
  },

  async capture(ctx, input) {
    const id = paymentIdOf(input.processorTransactionId);
    const current = await loadPayment(ctx, id);
    if (!current)
      return refused(input.amount, 'PAYMENT_NOT_FOUND', 'NMI does not know this payment.');
    const state = fromPayment(current, input.amount, null);
    if (state.status === 'captured') return state;
    if (state.status !== 'authorized')
      return refused(input.amount, 'PAYMENT_NOT_CAPTURABLE', 'This payment cannot be captured.');
    // A smaller capture would leave a rest; only the whole authorization is captured.
    if (!state.amount.eq(input.amount))
      return refused(
        input.amount,
        'CAPTURE_AMOUNT_MISMATCH',
        'Only the full authorized amount is captured.',
      );
    const result = await nmiCall(
      ctx,
      'POST',
      `${paymentPath(id)}/capture`,
      jsonWithAmounts({}, { amount: input.amount }),
    );
    if (!str(result.body.id) || str(result.body.response) === null)
      return failureFromError(result.body, input.amount);
    const answered = fromPayment(
      result.body,
      input.amount,
      str(result.body.response) === '1' ? 'captured' : null,
    );
    return answered.status === 'captured' ? { ...answered, processorTransactionId: id } : answered;
  },

  async voidAuthorization(ctx, input) {
    const id = paymentIdOf(input.processorTransactionId);
    const current = await loadPayment(ctx, id);
    if (!current)
      return refused(Money.zero(), 'PAYMENT_NOT_FOUND', 'NMI does not know this payment.');
    const state = fromPayment(current, null, null);
    if (state.status === 'voided') return state;
    if (state.status !== 'authorized')
      return refused(
        state.amount,
        'PAYMENT_NOT_VOIDABLE',
        'Only an uncaptured authorization can be voided.',
      );
    const result = await nmiCall(ctx, 'POST', `${paymentPath(id)}/void`, '{}');
    if (!str(result.body.id) || str(result.body.response) === null)
      return failureFromError(result.body, state.amount);
    const answered = fromPayment(
      result.body,
      state.amount,
      str(result.body.response) === '1' ? 'voided' : null,
    );
    return answered.status === 'voided' ? { ...answered, processorTransactionId: id } : answered;
  },

  async refund(ctx, input) {
    const id = paymentIdOf(input.processorTransactionId);
    const current = await loadPayment(ctx, id);
    if (!current)
      return refused(input.amount, 'PAYMENT_NOT_FOUND', 'NMI does not know this payment.');
    const state = fromPayment(current, input.amount, null);
    if (state.status !== 'captured')
      return refused(
        input.amount,
        'PAYMENT_NOT_REFUNDABLE',
        'Only a captured payment can be refunded.',
      );
    if (input.amount.gt(state.amount))
      return refused(
        input.amount,
        'REFUND_AMOUNT_INVALID',
        'The refund is larger than the payment.',
      );
    if (str(current.status) === 'pendingsettlement') {
      // Not settled yet: a refund is refused, so a full refund is done as a void (docs section 5).
      if (!state.amount.eq(input.amount))
        return refused(
          input.amount,
          'REFUND_NOT_YET_SETTLED',
          'A partial refund is possible once the payment has settled.',
        );
      const voided = await nmiCall(ctx, 'POST', `${paymentPath(id)}/void`, '{}');
      const answered = fromPayment(
        voided.body,
        input.amount,
        str(voided.body.response) === '1' ? 'voided' : null,
      );
      return answered.status === 'voided'
        ? buildTransaction({ status: 'refunded', amount: input.amount, processorTransactionId: id })
        : answered.status === 'declined' || answered.status === 'error'
          ? answered
          : failureFromError(voided.body, input.amount);
    }
    const result = await nmiCall(
      ctx,
      'POST',
      `${paymentPath(id)}/refund`,
      jsonWithAmounts({}, { amount: input.amount }),
    );
    if (!str(result.body.id) || str(result.body.response) === null)
      return failureFromError(result.body, input.amount);
    const answered = fromPayment(
      result.body,
      input.amount,
      str(result.body.response) === '1' ? 'refunded' : null,
    );
    return answered.status === 'refunded'
      ? { ...answered, amount: moneyOf(result.body.amount) ?? input.amount }
      : answered;
  },

  async getTransaction(ctx, id) {
    const payment = await loadPayment(ctx, id);
    if (!payment) throw new ValidationError('NMI does not know this payment.');
    return fromPayment(payment, null, null);
  },

  verifyWebhook: (ctx, request) => verifyNmiWebhook(ctx, request),
  parseWebhook: (request) => parseNmiEvent(request.rawBody),
  cardIdentity: (transaction) => transaction.cardIdentity,
  mapDecline: mapNmiDecline,
});
