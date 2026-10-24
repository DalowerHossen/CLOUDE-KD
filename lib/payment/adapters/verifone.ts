// path: lib/payment/adapters/verifone.ts
// Verifone adapter (docs/processors/verifone.md): hosted iFrame Checkout. The payer types the card inside Verifone's own
// frame (SAQ A); this code creates the checkout for one invoice, later reads back what happened and verifies it against
// the invoice, then captures, voids and refunds through the eCommerce API. No card data reaches this code.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { buildTransaction, defineAdapter, toMinorUnits } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, ProcessorAdapter, ProcessorTransaction } from '@/types/contracts';
import {
  checkoutBase,
  ecomBase,
  idempotencyUuid,
  list,
  obj,
  str,
  verifoneCall,
  type Json,
} from './verifone/api';
import {
  cardIdentity,
  centsOf,
  failureFromError,
  fromPayment,
  fromStored,
  mapVerifoneDecline,
} from './verifone/mapping';
import { parseVerifoneEvent, verifyVerifoneWebhook } from './verifone/webhook';

export { mapVerifoneDecline };

const OBJECT_ID = /^[A-Za-z0-9-]{8,64}$/;
const OUTCOME_EVENTS: ReadonlySet<string> = new Set([
  'TRANSACTION_SUCCESS',
  'TRANSACTION_FAILED',
  'TRANSACTION_DECLINED',
]);
/** A checkout page lives 15 minutes unless the request sets another time (docs section 4). */
const CHECKOUT_LIFETIME_MS = 15 * 60 * 1000;

/** Whole cents as the integer Verifone expects. */
function cents(amount: Money): number {
  return +toMinorUnits(amount);
}

function idOf(value: string): string {
  if (!OBJECT_ID.test(value)) throw new ValidationError('Not a Verifone id.');
  return value;
}

/** The merchant reference is the invoice id; Verifone refuses a value that starts with = + - or @. */
function referenceOf(invoiceId: string): string {
  const clean = invoiceId.slice(0, 50);
  return /^[=+\-@]/.test(clean) ? `i${clean}`.slice(0, 50) : clean;
}

function refused(amount: Money, code: string, message: string): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapVerifoneDecline({ code, message: null }),
    rawCode: code,
    message,
  });
}

async function loadStored(ctx: AdapterContext, id: string): Promise<Json | null> {
  const result = await verifoneCall(
    ctx,
    'GET',
    `${ecomBase(ctx)}/api/v2/transaction/${idOf(id)}`,
    null,
  );
  return result.status === 200 && str(result.body.id) ? result.body : null;
}

/** Results of payment actions are reported under the payment they belong to. */
function underPayment(tx: ProcessorTransaction, id: string): ProcessorTransaction {
  return { ...tx, processorTransactionId: id };
}

function latestOutcome(events: readonly Json[]): Json | null {
  const outcomes = events.filter((e) => OUTCOME_EVENTS.has(str(e.type) ?? ''));
  let best: Json | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const event of outcomes) {
    const time = Date.parse(str(event.timestamp) ?? '');
    const value = Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
    if (best === null || value >= bestTime) {
      best = event;
      bestTime = value;
    }
  }
  return best;
}

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'verifone',
  displayName: 'Verifone',
  capabilities: {
    supportsAuthCapture: true,
    supportsThreeDS: false,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: false,
    modes: [{ id: 'iframe_checkout', label: 'Hosted Checkout (iFrame)', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'region',
      label: 'Region',
      secret: false,
      required: true,
      pattern: '^(global|us|emea|nz)$',
      helpText:
        'Sandbox accounts: global or us. Live accounts: emea, us or nz (the region of the Verifone Central account).',
    },
    {
      key: 'userId',
      label: 'User ID',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9-]{8,64}$',
      helpText: 'Verifone Central, User Settings, My account, General information.',
    },
    {
      key: 'apiKey',
      label: 'API key',
      secret: true,
      required: true,
      pattern: '^[A-Za-z0-9+/=_-]{16,200}$',
      helpText:
        'Verifone Central, User Settings, API Keys. The user needs the Merchant Supervisor role.',
    },
    {
      key: 'entityId',
      label: 'Entity ID (Organization ID)',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9-]{8,64}$',
      helpText:
        'Verifone Central, Administration, Organizations, the organization, Organization ID.',
    },
    {
      key: 'paymentContractId',
      label: 'Payment provider contract ID',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9-]{8,64}$',
      helpText:
        'The USD card contract attached to the organization (Administration, Payment provider contracts).',
    },
  ],

  async testConnection(ctx) {
    try {
      const result = await verifoneCall(
        ctx,
        'GET',
        `${ecomBase(ctx)}/api/v2/transactions?_limit=1`,
        null,
      );
      if (result.status === 200)
        return {
          ok: true,
          message: 'Verifone accepted the user id and API key.',
          details: { mode: ctx.environment, region: ctx.credentials.region ?? '' },
        };
      if (result.status === 403)
        return { ok: false, message: 'Verifone refused this user for the transaction reports.' };
      return { ok: false, message: 'Verifone did not answer as expected for this region.' };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof ValidationError ? error.message : 'Verifone could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx, input) {
    const entityId = ctx.credentials.entityId ?? '';
    const contract = ctx.credentials.paymentContractId ?? '';
    if (entityId === '' || contract === '')
      throw new ValidationError('The Verifone entity id or payment contract id is missing.');
    const result = await verifoneCall(ctx, 'POST', `${checkoutBase(ctx)}/v2/checkout`, {
      entity_id: entityId,
      currency_code: 'USD',
      amount: cents(input.amount),
      merchant_reference: referenceOf(input.invoiceId),
      interaction_type: 'IFRAME',
      // The payer stays on our page: Verifone reports the end of the checkout to the page (docs section 4).
      show_confirmation_page: false,
      configurations: {
        card: { mode: 'PAYMENT', payment_contract_id: contract, capture_now: false },
      },
    });
    const id = str(result.body.id);
    const loaderUrl = str(result.body.url);
    if ((result.status !== 200 && result.status !== 201) || !id || !loaderUrl)
      throw new ValidationError(
        `Verifone refused to create the checkout${result.errorCode ? ` (code ${result.errorCode})` : ''}.`,
      );
    // The loader script must come from the region host of this account and name this checkout.
    let loader: URL;
    try {
      loader = new URL(loaderUrl);
    } catch {
      throw new ValidationError('Verifone returned an unusable checkout address.');
    }
    const host = new URL(checkoutBase(ctx)).origin;
    if (
      loader.origin !== host ||
      !loader.pathname.endsWith('/loader.js') ||
      loader.searchParams.get('checkoutId') !== id ||
      !OBJECT_ID.test(id)
    )
      throw new ValidationError('Verifone returned an unexpected checkout address.');
    return {
      clientConfig: { checkoutId: id, loaderUrl },
      expiresAt: new Date(Date.now() + CHECKOUT_LIFETIME_MS).toISOString(),
    };
  },

  async authorize(ctx, input) {
    const checkoutId = idOf(input.paymentToken);
    const read = await verifoneCall(
      ctx,
      'GET',
      `${checkoutBase(ctx)}/v2/checkout/${checkoutId}`,
      null,
    );
    if (read.status === 404)
      return refused(input.amount, '109', 'Verifone does not know this checkout.');
    if (read.status !== 200) return failureFromError(read.errorCode, read.body, input.amount);
    const checkout = read.body;
    const expected = centsOf(checkout.amount);
    if (
      str(checkout.entity_id) !== (ctx.credentials.entityId ?? '') ||
      str(checkout.merchant_reference) !== referenceOf(input.invoiceId) ||
      checkout.currency_code !== 'USD' ||
      !expected ||
      !expected.eq(input.amount)
    )
      return refused(
        input.amount,
        'CHECKOUT_MISMATCH',
        'This checkout does not belong to this payment.',
      );
    const outcome = latestOutcome(list(checkout.events));
    const payment = obj(outcome?.details);
    if (!outcome || !payment)
      return refused(
        input.amount,
        'CHECKOUT_NOT_COMPLETED',
        'The payment was not completed in the secure form.',
      );
    const transactionId = str(payment.id);
    const linked = str(checkout.transaction_id);
    if (transactionId && linked && linked !== transactionId)
      return refused(
        input.amount,
        'CHECKOUT_MISMATCH',
        'This checkout does not belong to this payment.',
      );
    let identity = cardIdentity(str(payment.card), null, null);
    if (!identity && transactionId && OBJECT_ID.test(transactionId)) {
      try {
        const stored = await loadStored(ctx, transactionId);
        if (stored)
          identity = cardIdentity(
            null,
            str(stored.masked_card_number),
            str(stored.card_brand) ?? str(stored.payment_product_type),
          );
      } catch {
        identity = null;
      }
    }
    const result = fromPayment(payment, input.amount, identity);
    if (result.amount.eq(input.amount) || result.status === 'declined') return result;
    // The held amount differs from the invoice: release it and refuse.
    if (transactionId && OBJECT_ID.test(transactionId) && result.status === 'authorized') {
      try {
        await verifoneCall(
          ctx,
          'POST',
          `${ecomBase(ctx)}/api/v2/transactions/${transactionId}/void`,
          null,
        );
      } catch {
        // The refusal below stands; the hold lapses at the issuer.
      }
    }
    return refused(
      input.amount,
      'AMOUNT_MISMATCH',
      'The authorized amount differs from the invoice.',
    );
  },

  async capture(ctx, input) {
    const id = idOf(input.processorTransactionId);
    const current = await loadStored(ctx, id);
    if (!current) return refused(input.amount, '109', 'Verifone does not know this payment.');
    const state = fromStored(current, input.amount);
    if (state.status === 'captured') return state;
    if (state.status !== 'authorized')
      return refused(input.amount, 'PAYMENT_NOT_CAPTURABLE', 'This payment cannot be captured.');
    // A smaller capture would leave a rest that must be released separately; only the whole authorization is captured.
    if (!state.amount.eq(input.amount))
      return refused(
        input.amount,
        'CAPTURE_AMOUNT_MISMATCH',
        'Only the full authorized amount is captured.',
      );
    const result = await verifoneCall(
      ctx,
      'POST',
      `${ecomBase(ctx)}/api/v2/transactions/${id}/capture`,
      {
        amount: cents(input.amount),
      },
    );
    if (result.status !== 200 && result.status !== 201)
      return failureFromError(result.errorCode, result.body, input.amount);
    const answered = fromPayment(result.body, input.amount, state.cardIdentity);
    if (answered.status === 'captured') return underPayment(answered, id);
    const after = await loadStored(ctx, id);
    const reread = after ? fromStored(after, input.amount) : null;
    if (reread && reread.status === 'captured') return reread;
    return buildTransaction({
      status: 'pending',
      amount: input.amount,
      processorTransactionId: id,
      rawCode: answered.rawCode,
      cardIdentity: state.cardIdentity,
    });
  },

  async voidAuthorization(ctx, input) {
    const id = idOf(input.processorTransactionId);
    const current = await loadStored(ctx, id);
    if (!current) return refused(Money.zero(), '109', 'Verifone does not know this payment.');
    const state = fromStored(current, null);
    if (state.status === 'voided') return state;
    if (state.status !== 'authorized')
      return refused(
        state.amount,
        'PAYMENT_NOT_VOIDABLE',
        'Only an uncaptured authorization can be voided.',
      );
    const result = await verifoneCall(
      ctx,
      'POST',
      `${ecomBase(ctx)}/api/v2/transactions/${id}/void`,
      null,
    );
    if (result.status !== 200 && result.status !== 201)
      return failureFromError(result.errorCode, result.body, state.amount);
    const answered = fromPayment(result.body, state.amount, state.cardIdentity);
    if (answered.status === 'voided') return underPayment(answered, id);
    const after = await loadStored(ctx, id);
    const reread = after ? fromStored(after, state.amount) : null;
    if (reread && reread.status === 'voided') return reread;
    return buildTransaction({
      status: 'pending',
      amount: state.amount,
      processorTransactionId: id,
      rawCode: answered.rawCode,
      cardIdentity: state.cardIdentity,
    });
  },

  async refund(ctx, input) {
    const id = idOf(input.processorTransactionId);
    const current = await loadStored(ctx, id);
    if (!current) return refused(input.amount, '109', 'Verifone does not know this payment.');
    const state = fromStored(current, input.amount);
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
    if (str(current.transaction_status) === 'SETTLEMENT_REQUESTED') {
      // Queued but not yet sent to the acquirer: only the whole capture can be cancelled (docs section 5).
      if (!state.amount.eq(input.amount))
        return refused(
          input.amount,
          'REFUND_NOT_YET_SETTLED',
          'A partial refund is possible once the payment has settled.',
        );
      const cancelled = await verifoneCall(
        ctx,
        'POST',
        `${ecomBase(ctx)}/api/v2/transactions/${id}/void_capture`,
        null,
      );
      if (cancelled.status !== 200 && cancelled.status !== 201)
        return failureFromError(cancelled.errorCode, cancelled.body, input.amount);
      const answered = fromPayment(cancelled.body, input.amount, state.cardIdentity);
      return answered.status === 'voided' || answered.status === 'refunded'
        ? buildTransaction({ status: 'refunded', amount: input.amount, processorTransactionId: id })
        : buildTransaction({
            status: 'pending',
            amount: input.amount,
            processorTransactionId: id,
            rawCode: answered.rawCode,
          });
    }
    const result = await verifoneCall(
      ctx,
      'POST',
      `${ecomBase(ctx)}/api/v2/transactions/${id}/refund`,
      {
        amount: cents(input.amount),
        ...(input.reason ? { reason: input.reason.slice(0, 190) } : {}),
      },
      { 'x-vfi-api-idempotencykey': idempotencyUuid(input.idempotencyKey) },
    );
    if (result.status !== 200 && result.status !== 201)
      return failureFromError(result.errorCode, result.body, input.amount);
    const answered = fromPayment(result.body, input.amount, null);
    // The refund is its own transaction: its id is the processor id of this result.
    return buildTransaction({
      status:
        answered.status === 'refunded'
          ? 'refunded'
          : answered.status === 'pending'
            ? 'pending'
            : answered.status === 'declined'
              ? 'declined'
              : 'error',
      amount: centsOf(result.body.amount) ?? input.amount,
      processorTransactionId: str(result.body.id) ?? id,
      declineCategory: answered.declineCategory,
      rawCode: answered.rawCode,
    });
  },

  async getTransaction(ctx, id) {
    const stored = await loadStored(ctx, id);
    if (!stored) throw new ValidationError('Verifone does not know this payment.');
    return fromStored(stored, null);
  },

  verifyWebhook: (ctx, request) => verifyVerifoneWebhook(ctx, request),
  parseWebhook: (request) => parseVerifoneEvent(request.rawBody),
  cardIdentity: (transaction) => transaction.cardIdentity,
  mapDecline: mapVerifoneDecline,
});
