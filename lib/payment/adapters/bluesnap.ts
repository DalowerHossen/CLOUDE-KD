// path: lib/payment/adapters/bluesnap.ts
// BlueSnap adapter (docs/processors/bluesnap.md): Payment API with Hosted Payment Fields. The server creates a payment
// fields token, the browser binds the card to it inside BlueSnap's own frames (3D Secure included), and this code
// authorizes, captures, reverses and refunds with that token and the transaction ids. No card data reaches this code.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { buildTransaction, defineAdapter, toMinorUnits } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, ProcessorAdapter, ProcessorTransaction } from '@/types/contracts';
import { bluesnapCall, obj, scriptUrl, str, type Json } from './bluesnap/api';
import {
  failureFromErrors,
  fromTransaction,
  mapBluesnapDecline,
  moneyFrom,
} from './bluesnap/mapping';
import { parseBluesnapEvent, verifyBluesnapWebhook } from './bluesnap/webhook';

export { mapBluesnapDecline };

const PF_TOKEN = /^[A-Za-z0-9_-]{16,200}$/;
const TRANSACTION_ID = /^\d{1,20}$/;

/** Decimal text with two places ("120.50") for USD. */
export function bluesnapValue(amount: Money): string {
  const cents = toMinorUnits(amount).padStart(3, '0');
  return `${cents.slice(0, -2)}.${cents.slice(-2)}`;
}

/** The API takes the amount as a JSON number; two decimals are exact. */
function amountNumber(amount: Money): number {
  return +bluesnapValue(amount);
}

function transactionIdOf(value: string): string {
  if (!TRANSACTION_ID.test(value)) throw new ValidationError('Not a BlueSnap transaction id.');
  return value;
}

/** Creates a Hosted Payment Fields token; the token is the last segment of the `Location` header. */
async function createToken(ctx: AdapterContext): Promise<{ status: number; token: string | null }> {
  const result = await bluesnapCall(ctx, 'POST', '/services/2/payment-fields-tokens', {}, null);
  const location = result.headers.location ?? '';
  const token = location.split('/').pop() ?? '';
  return {
    status: result.status,
    token: result.status === 201 && PF_TOKEN.test(token) ? token : null,
  };
}

async function transact(
  ctx: AdapterContext,
  method: 'POST' | 'PUT',
  path: string,
  key: string,
  body: Json,
): Promise<{
  transaction: Json | null;
  errors: ProcessorTransaction | null;
  status: number;
  names: string[];
}> {
  const result = await bluesnapCall(ctx, method, path, body, key);
  const ok = result.status === 200 && result.errors.length === 0;
  return {
    transaction: ok ? result.body : null,
    errors: ok ? null : failureFromErrors(result.errors, Money.zero()),
    status: result.status,
    names: result.errors.map((e) => e.errorName),
  };
}

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'bluesnap',
  displayName: 'BlueSnap',
  capabilities: {
    supportsAuthCapture: true,
    supportsThreeDS: true,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: false,
    modes: [{ id: 'hosted_fields', label: 'Hosted Payment Fields', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'apiUsername',
      label: 'API user key',
      secret: false,
      required: true,
      pattern: '^[A-Za-z0-9_]{6,60}$',
      helpText:
        'Merchant Portal: Settings > API Settings (sandbox account for the sandbox environment). The platform servers must be on the Authorized IPs list there.',
    },
    {
      key: 'apiPassword',
      label: 'API password',
      secret: true,
      required: true,
      pattern: "^[A-Za-z0-9_~!@#&$%^*()|'-]{12,128}$",
      helpText: 'The API password set in the same place (12 to 128 characters).',
    },
  ],

  async testConnection(ctx) {
    try {
      const { status, token } = await createToken(ctx);
      if (token)
        return {
          ok: true,
          message: 'BlueSnap accepted the API user key and password.',
          details: { mode: ctx.environment },
        };
      if (status === 403)
        return {
          ok: false,
          message:
            'BlueSnap did not accept the credentials, the permissions or the address of this server (check Authorized IPs).',
        };
      return { ok: false, message: 'BlueSnap did not accept the request.' };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof ValidationError ? error.message : 'BlueSnap could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx, input) {
    const { token } = await createToken(ctx);
    if (!token) throw new Error('bluesnap token not created');
    return {
      clientConfig: {
        pfToken: token,
        scriptUrl: scriptUrl(ctx.environment),
        environment: ctx.environment,
        amount: bluesnapValue(input.amount),
        threeDS: input.threeDS,
      },
      // The token expires 60 minutes after creation (docs section 4); refresh a little early.
      expiresAt: new Date(Date.now() + 55 * 60_000).toISOString(),
    };
  },

  async authorize(ctx, input) {
    if (!PF_TOKEN.test(input.paymentToken))
      throw new ValidationError('Not a BlueSnap payment token.');
    const requested = input.threeDS !== 'disabled';
    const { transaction, errors, status, names } = await transact(
      ctx,
      'POST',
      '/services/2/transactions',
      input.idempotencyKey,
      {
        cardTransactionType: 'AUTH_ONLY',
        amount: amountNumber(input.amount),
        currency: 'USD',
        pfToken: input.paymentToken,
        merchantTransactionId: input.idempotencyKey.replace(/[^A-Za-z0-9-]/g, '').slice(0, 50),
        // The default is to store the card; the platform never vaults (docs section 5).
        storeCard: false,
        transactionInitiator: 'SHOPPER',
        ...(input.billing.postalCode || input.billing.country
          ? {
              cardHolderInfo: {
                ...(input.billing.postalCode ? { zip: input.billing.postalCode.slice(0, 20) } : {}),
                ...(input.billing.country ? { country: input.billing.country } : {}),
              },
            }
          : {}),
      },
    );
    if (transaction) return fromTransaction(transaction, requested, input.amount);
    if (status === 403 && names.length === 0)
      throw new ValidationError(
        'BlueSnap did not accept the credentials, permissions or server address.',
      );
    return { ...(errors ?? failureFromErrors([], input.amount)), amount: input.amount };
  },

  async capture(ctx, input) {
    const id = transactionIdOf(input.processorTransactionId);
    const { transaction, errors } = await transact(
      ctx,
      'PUT',
      '/services/2/transactions',
      input.idempotencyKey,
      {
        cardTransactionType: 'CAPTURE',
        transactionId: id,
        amount: amountNumber(input.amount),
      },
    );
    if (transaction) return fromTransaction(transaction, false, input.amount);
    return { ...(errors ?? failureFromErrors([], input.amount)), amount: input.amount };
  },

  async voidAuthorization(ctx, input) {
    const id = transactionIdOf(input.processorTransactionId);
    const { transaction, errors, names } = await transact(
      ctx,
      'PUT',
      '/services/2/transactions',
      input.idempotencyKey,
      { cardTransactionType: 'AUTH_REVERSAL', transactionId: id },
    );
    if (transaction) return fromTransaction(transaction, false, null);
    // "Already reversed" is the state asked for.
    if (names.includes('AUTHORIZATION_AMOUNT_ALREADY_REVERSED'))
      return buildTransaction({
        status: 'voided',
        amount: Money.zero(),
        processorTransactionId: id,
      });
    return errors ?? failureFromErrors([], Money.zero());
  },

  async refund(ctx, input) {
    const id = transactionIdOf(input.processorTransactionId);
    const result = await bluesnapCall(
      ctx,
      'POST',
      `/services/2/transactions/refund/${id}`,
      {
        amount: amountNumber(input.amount),
        cancelSubscriptions: false,
        ...(input.reason ? { reason: input.reason.slice(0, 4000) } : {}),
      },
      input.idempotencyKey,
    );
    const refundId = result.body.refundTransactionId;
    if (result.status === 200 && result.errors.length === 0 && refundId !== undefined) {
      const state = (str(result.body.refundStatus) ?? '').toUpperCase();
      return buildTransaction({
        status: state === 'SUCCESS' ? 'refunded' : state === 'PENDING' ? 'pending' : 'declined',
        amount: moneyFrom(result.body.amount) ?? input.amount,
        processorTransactionId: String(refundId),
        declineCategory: state === 'SUCCESS' || state === 'PENDING' ? null : 'processor_error',
        rawCode: state || null,
      });
    }
    return { ...failureFromErrors(result.errors, input.amount), amount: input.amount };
  },

  async getTransaction(ctx, id) {
    const result = await bluesnapCall(
      ctx,
      'GET',
      `/services/2/transactions/${transactionIdOf(id)}`,
      null,
      null,
    );
    if (result.status !== 200 || obj(result.body) === null || result.errors.length > 0)
      throw new ValidationError('BlueSnap does not know this transaction.');
    return fromTransaction(result.body, true, null);
  },

  verifyWebhook: () => verifyBluesnapWebhook(),
  parseWebhook: (request) => parseBluesnapEvent(request),
  cardIdentity: (transaction) => transaction.cardIdentity,
  mapDecline: mapBluesnapDecline,
});
