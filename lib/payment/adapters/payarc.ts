// path: lib/payment/adapters/payarc.ts
// PayArc adapter (docs/processors/payarc.md): Hosted Fields iframes. The browser turns the card into a single-use token
// inside PayArc's own frames; this code authorizes, captures, voids and refunds with that token and the charge ids.
// No card data reaches this code.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { buildTransaction, defineAdapter, toMinorUnits } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, ProcessorAdapter, ProcessorTransaction } from '@/types/contracts';
import { PAYARC_SCRIPT_URLS, obj, payarcCall, requestKey, str, type Json } from './payarc/api';
import {
  centsOf,
  chargeOf,
  failureFromBody,
  fromCharge,
  latestRefund,
  mapPayarcDecline,
} from './payarc/mapping';
import { parsePayarcEvent, verifyPayarcWebhook } from './payarc/webhook';

export { mapPayarcDecline };

const TOKEN = /^[A-Za-z0-9]{8,40}$/;
const CHARGE_ID = /^[A-Za-z0-9]{8,40}$/;

/** Whole cents as the integer PayArc expects. */
function cents(amount: Money): number {
  return +toMinorUnits(amount);
}

function chargeIdOf(value: string): string {
  if (!CHARGE_ID.test(value)) throw new ValidationError('Not a PayArc charge id.');
  return value;
}

function refused(amount: Money, code: string, message: string): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapPayarcDecline({ code, message: null }),
    rawCode: code,
    message,
  });
}

async function loadCharge(ctx: AdapterContext, id: string): Promise<Json | null> {
  const result = await payarcCall(ctx, 'GET', `/charges/${chargeIdOf(id)}`, null);
  return result.status === 200 ? chargeOf(result.body) : null;
}

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'payarc',
  displayName: 'PayArc',
  capabilities: {
    supportsAuthCapture: true,
    supportsThreeDS: false,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: false,
    modes: [{ id: 'hosted_fields', label: 'Hosted Fields (iframes)', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'clientId',
      label: 'Client ID',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9._-]{6,200}$',
      helpText:
        'PayArc dashboard, API page, Client ID (use the sandbox dashboard for the sandbox environment).',
    },
    {
      key: 'accessToken',
      label: 'API bearer token',
      secret: true,
      required: true,
      pattern: '^[A-Za-z0-9._~+/=-]{16,4000}$',
      helpText:
        'PayArc dashboard, API page, API Bearer Token of the merchant account (reveal with the eye icon).',
    },
  ],

  async testConnection(ctx) {
    try {
      const result = await payarcCall(ctx, 'GET', '/charges?limit=1', null);
      if (result.status === 200)
        return {
          ok: true,
          message: 'PayArc accepted the access token.',
          details: { mode: ctx.environment },
        };
      return { ok: false, message: 'PayArc did not answer as expected for this token.' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof ValidationError ? error.message : 'PayArc could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx, input) {
    const clientId = ctx.credentials.clientId ?? '';
    if (clientId === '') throw new ValidationError('The PayArc client id is missing.');
    const scriptUrl = PAYARC_SCRIPT_URLS[ctx.environment];
    if (!scriptUrl)
      throw new ValidationError(
        'The PayArc Hosted Fields address for live payments is not available yet (see the STEP 11 blockers).',
      );
    const whole = toMinorUnits(input.amount).padStart(3, '0');
    return {
      clientConfig: {
        clientId,
        scriptUrl,
        amount: `${whole.slice(0, -2)}.${whole.slice(-2)}`,
      },
      expiresAt: null,
    };
  },

  async authorize(ctx, input) {
    if (!TOKEN.test(input.paymentToken)) throw new ValidationError('Not a PayArc payment token.');
    const result = await payarcCall(
      ctx,
      'POST',
      '/charges',
      {
        amount: cents(input.amount),
        currency: 'usd',
        token_id: input.paymentToken,
        capture: 0,
        metadata: JSON.stringify({ invoice: input.invoiceId.slice(0, 100) }),
      },
      { 'idempotency-key': requestKey(input.idempotencyKey) },
    );
    const charge = chargeOf(result.body);
    if (!charge || result.status >= 400) return failureFromBody(result.body, input.amount);
    const mapped = fromCharge(charge, input.amount);
    if (mapped.status !== 'authorized') return mapped;
    // A partial approval holds less than the invoice: release it and refuse.
    const approved = centsOf(charge.amount_approved);
    if (!mapped.amount.eq(input.amount) || (approved && !approved.eq(input.amount))) {
      try {
        await payarcCall(ctx, 'POST', `/charges/${chargeIdOf(String(charge.id))}/void`, {
          reason: 'other',
          void_description: 'Authorized amount differs from the invoice',
        });
      } catch {
        // The refusal below stands; the hold lapses after seven days.
      }
      return refused(
        input.amount,
        'AMOUNT_MISMATCH',
        'The authorized amount differs from the invoice.',
      );
    }
    return mapped;
  },

  async capture(ctx, input) {
    const id = chargeIdOf(input.processorTransactionId);
    const current = await loadCharge(ctx, id);
    if (!current)
      return refused(input.amount, 'CHARGE_NOT_FOUND', 'PayArc does not know this charge.');
    const state = fromCharge(current, input.amount);
    if (state.status === 'captured') return state;
    if (state.status !== 'authorized')
      return refused(input.amount, 'CHARGE_NOT_CAPTURABLE', 'This charge cannot be captured.');
    // A smaller capture would leave a rest; only the whole authorization is captured.
    if (!state.amount.eq(input.amount))
      return refused(
        input.amount,
        'CAPTURE_AMOUNT_MISMATCH',
        'Only the full authorized amount is captured.',
      );
    const result = await payarcCall(ctx, 'POST', `/charges/${id}/capture`, {
      amount: cents(input.amount),
    });
    if (result.status === 409) {
      const after = await loadCharge(ctx, id);
      const reread = after ? fromCharge(after, input.amount) : null;
      if (reread && reread.status === 'captured') return reread;
    }
    const charge = chargeOf(result.body);
    if (!charge || result.status >= 400) return failureFromBody(result.body, input.amount);
    const answered = fromCharge(charge, input.amount);
    if (answered.status === 'captured') return answered;
    const after = await loadCharge(ctx, id);
    const reread = after ? fromCharge(after, input.amount) : null;
    return reread && reread.status === 'captured'
      ? reread
      : buildTransaction({
          status: 'pending',
          amount: input.amount,
          processorTransactionId: id,
          rawCode: answered.rawCode,
          cardIdentity: state.cardIdentity,
        });
  },

  async voidAuthorization(ctx, input) {
    const id = chargeIdOf(input.processorTransactionId);
    const current = await loadCharge(ctx, id);
    if (!current)
      return refused(Money.zero(), 'CHARGE_NOT_FOUND', 'PayArc does not know this charge.');
    const state = fromCharge(current, null);
    if (state.status === 'voided') return state;
    if (state.status !== 'authorized')
      return refused(
        state.amount,
        'CHARGE_NOT_VOIDABLE',
        'Only an uncaptured authorization can be voided.',
      );
    const result = await payarcCall(ctx, 'POST', `/charges/${id}/void`, {
      reason: 'other',
      void_description: 'Authorization released by the platform',
    });
    const charge = chargeOf(result.body);
    if (!charge || result.status >= 400) return failureFromBody(result.body, state.amount);
    return fromCharge(charge, state.amount);
  },

  async refund(ctx, input) {
    const id = chargeIdOf(input.processorTransactionId);
    const current = await loadCharge(ctx, id);
    if (!current)
      return refused(input.amount, 'CHARGE_NOT_FOUND', 'PayArc does not know this charge.');
    const state = fromCharge(current, input.amount);
    if (state.status !== 'captured')
      return refused(
        input.amount,
        'CHARGE_NOT_REFUNDABLE',
        'Only a captured charge can be refunded.',
      );
    if (input.amount.gt(state.amount))
      return refused(
        input.amount,
        'REFUND_AMOUNT_INVALID',
        'The refund is larger than the charge.',
      );
    const reason = input.reason && input.reason.length >= 5 ? input.reason.slice(0, 190) : null;
    const result = await payarcCall(ctx, 'POST', `/charges/${id}/refunds`, {
      amount: cents(input.amount),
      reason: 'other',
      ...(reason ? { description: reason } : {}),
    });
    if (result.status === 422 && str(result.body.message) === 'Return Not Allowed.') {
      // Not batched yet: a refund is refused, so a full refund is done as a void (docs section 5).
      if (!state.amount.eq(input.amount))
        return refused(
          input.amount,
          'REFUND_NOT_YET_SETTLED',
          'A partial refund is possible once the charge has been batched.',
        );
      const voided = await payarcCall(ctx, 'POST', `/charges/${id}/void`, {
        reason: 'requested_by_customer',
        void_description: 'Refund before settlement',
      });
      const voidedCharge = chargeOf(voided.body);
      return voidedCharge &&
        voided.status < 400 &&
        fromCharge(voidedCharge, null).status === 'voided'
        ? buildTransaction({ status: 'refunded', amount: input.amount, processorTransactionId: id })
        : failureFromBody(voided.body, input.amount);
    }
    const data = result.status < 400 ? obj(result.body.data) : null;
    if (data && data.object === 'Refund') return refundResult(data, input.amount, id);
    const refundObject = data ? chargeOf(result.body) : null;
    if (!refundObject) return failureFromBody(result.body, input.amount);
    const listed = latestRefund(refundObject);
    if (listed) return refundResult(listed, input.amount, id);
    const after = fromCharge(refundObject, null);
    return buildTransaction({
      status:
        after.status === 'refunded' || refundObject.status === 'partial_refund'
          ? 'refunded'
          : 'pending',
      amount: input.amount,
      processorTransactionId: id,
      rawCode: after.rawCode,
    });
  },

  async getTransaction(ctx, id) {
    const charge = await loadCharge(ctx, id);
    if (!charge) throw new ValidationError('PayArc does not know this charge.');
    return fromCharge(charge, null);
  },

  verifyWebhook: () => verifyPayarcWebhook(),
  parseWebhook: (request) => parsePayarcEvent(request),
  cardIdentity: (transaction) => transaction.cardIdentity,
  mapDecline: mapPayarcDecline,
});

function refundResult(refund: Json, requested: Money, chargeId: string): ProcessorTransaction {
  const state = str(refund.status);
  const ok = state === 'refunded';
  return buildTransaction({
    status: ok ? 'refunded' : state === 'failed_by_gateway' ? 'declined' : 'pending',
    amount: centsOf(refund.refund_amount) ?? requested,
    processorTransactionId: str(refund.id) ?? chargeId,
    declineCategory: state === 'failed_by_gateway' ? 'processor_error' : null,
    rawCode: state,
  });
}
