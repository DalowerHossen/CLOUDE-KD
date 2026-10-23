// path: lib/payment/adapters/braintree.ts
// Braintree adapter (docs/processors/braintree.md): GraphQL API with Hosted Fields in the browser. The browser turns the
// card into a single-use payment method id (a "nonce", upgraded by 3D Secure when it runs); this code authorizes,
// captures, voids and refunds with that id and the transaction ids. No card data reaches this code.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { buildTransaction, defineAdapter, toMinorUnits } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, ProcessorAdapter, ProcessorTransaction } from '@/types/contracts';
import {
  SDK_BASE,
  graphql,
  isTransient,
  obj,
  str,
  type GraphqlError,
  type GraphqlResult,
  type Json,
} from './braintree/api';
import { TRANSACTION_FIELDS, fromTransaction, mapBraintreeDecline } from './braintree/mapping';
import { parseBraintreeEvent, verifyBraintreeWebhook } from './braintree/webhook';

export { mapBraintreeDecline };

const NONCE = /^[A-Za-z0-9_.-]{8,200}$/;
const TRANSACTION_ID = /^[A-Za-z0-9_=-]{8,120}$/;
const IP = /^[0-9a-fA-F:.]{3,45}$/;

/** Decimal text with two places ("120.50") as the Amount scalar expects for USD. */
export function braintreeValue(amount: Money): string {
  const cents = toMinorUnits(amount).padStart(3, '0');
  return `${cents.slice(0, -2)}.${cents.slice(-2)}`;
}

function transactionIdOf(value: string): string {
  if (!TRANSACTION_ID.test(value)) throw new ValidationError('Not a Braintree transaction id.');
  return value;
}

function merchantAccount(
  ctx: AdapterContext,
): { merchantAccountId: string } | Record<string, never> {
  const id = ctx.credentials.merchantAccountId ?? '';
  return id === '' ? {} : { merchantAccountId: id };
}

/** A request the service refused (validation, unknown id): a normal payment failure, not an outage. */
function refused(amount: Money, errors: readonly GraphqlError[]): ProcessorTransaction {
  const first = errors[0];
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: mapBraintreeDecline({ code: first?.legacyCode ?? null, message: null }),
    rawCode: first?.legacyCode ?? first?.errorClass ?? null,
    message: 'Braintree could not process this request.',
  });
}

function transactionFrom(result: GraphqlResult, mutation: string): Json | null {
  const tx = obj(obj(result.data?.[mutation])?.transaction);
  return tx && str(tx.id) ? tx : null;
}

/** Runs a mutation whose payload has a `transaction`; throws for outages so the caller can retry with the same key. */
async function mutateTransaction(
  ctx: AdapterContext,
  mutation: string,
  inputType: string,
  input: Json,
): Promise<{ tx: Json | null; errors: GraphqlError[] }> {
  const result = await graphql(
    ctx,
    `mutation M($input: ${inputType}!) { ${mutation}(input: $input) { transaction { ${TRANSACTION_FIELDS} } } }`,
    { input },
  );
  const tx = transactionFrom(result, mutation);
  if (!tx && isTransient(result.errors)) throw new Error('braintree temporarily unavailable');
  return { tx, errors: result.errors };
}

async function fetchTransaction(ctx: AdapterContext, id: string): Promise<Json | null> {
  const result = await graphql(
    ctx,
    `query T($id: ID!) { node(id: $id) { ... on Transaction { ${TRANSACTION_FIELDS} } } }`,
    { id: transactionIdOf(id) },
  );
  if (result.errors.length > 0 && isTransient(result.errors))
    throw new Error('braintree temporarily unavailable');
  const node = obj(result.data?.node);
  return node && str(node.id) ? node : null;
}

async function authorize(
  ctx: AdapterContext,
  input: Parameters<ProcessorAdapter['authorize']>[1],
): Promise<ProcessorTransaction> {
  if (!NONCE.test(input.paymentToken))
    throw new ValidationError('Not a Braintree payment method id.');
  const requested = input.threeDS !== 'disabled';
  const { tx, errors } = await mutateTransaction(
    ctx,
    'authorizePaymentMethod',
    'AuthorizePaymentMethodInput',
    {
      apiRequestKey: input.idempotencyKey,
      paymentMethodId: input.paymentToken,
      transaction: {
        amount: braintreeValue(input.amount),
        orderId: input.invoiceId.slice(0, 255),
        ...merchantAccount(ctx),
        ...(IP.test(input.payerIp) ? { riskData: { customerIp: input.payerIp } } : {}),
      },
    },
  );
  return tx ? fromTransaction(tx, requested, input.amount) : refused(input.amount, errors);
}

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'braintree',
  displayName: 'Braintree',
  capabilities: {
    supportsAuthCapture: true,
    supportsThreeDS: true,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: false,
    modes: [{ id: 'hosted_fields', label: 'Hosted Fields', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'publicKey',
      label: 'Public key',
      secret: false,
      required: true,
      pattern: '^[a-z0-9]{12,40}$',
      helpText:
        'From the API key pair in the Braintree Control Panel (sandbox for the sandbox environment).',
    },
    {
      key: 'privateKey',
      label: 'Private key',
      secret: true,
      required: true,
      pattern: '^[a-z0-9]{24,64}$',
      helpText: 'The private key of the same API key pair.',
    },
    {
      key: 'merchantAccountId',
      label: 'Merchant account ID',
      secret: false,
      required: false,
      pattern: '^[A-Za-z0-9_]{1,64}$',
      helpText:
        'Optional. A USD merchant account; the default merchant account is used when empty.',
    },
  ],

  async testConnection(ctx) {
    try {
      const ping = await graphql(ctx, 'query { ping }', null);
      if (ping.data?.ping !== 'pong')
        return { ok: false, message: 'Braintree did not answer the connection check.' };
      const token = await graphql(
        ctx,
        'mutation T($input: CreateClientTokenInput) { createClientToken(input: $input) { clientToken } }',
        { input: { clientToken: merchantAccount(ctx) } },
      );
      if (str(obj(token.data?.createClientToken)?.clientToken))
        return {
          ok: true,
          message: 'Braintree accepted the API keys.',
          details: { mode: ctx.environment },
        };
      return {
        ok: false,
        message: 'Braintree accepted the keys, but not the merchant account id.',
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof ValidationError ? error.message : 'Braintree could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx, input) {
    const result = await graphql(
      ctx,
      'mutation T($input: CreateClientTokenInput) { createClientToken(input: $input) { clientToken } }',
      { input: { clientToken: merchantAccount(ctx) } },
    );
    const clientToken = str(obj(result.data?.createClientToken)?.clientToken);
    if (!clientToken) throw new Error('braintree client token not created');
    return {
      clientConfig: {
        clientToken,
        sdkBase: SDK_BASE,
        environment: ctx.environment,
        amount: braintreeValue(input.amount),
        threeDS: input.threeDS,
      },
      // A client token lives 24 hours (docs section 3 of the guides read); refresh an hour early.
      expiresAt: new Date(Date.now() + 23 * 3_600_000).toISOString(),
    };
  },

  authorize,

  async capture(ctx, input) {
    const id = transactionIdOf(input.processorTransactionId);
    const { tx, errors } = await mutateTransaction(
      ctx,
      'captureTransaction',
      'CaptureTransactionInput',
      {
        apiRequestKey: input.idempotencyKey,
        transactionId: id,
        transaction: { amount: braintreeValue(input.amount) },
      },
    );
    if (tx) return fromTransaction(tx, false, input.amount);
    // A repeated capture that the service refuses may already have worked: report the state it is in.
    const current = await fetchTransaction(ctx, id);
    if (current && fromTransaction(current, false, input.amount).status === 'captured')
      return fromTransaction(current, false, input.amount);
    return refused(input.amount, errors);
  },

  async voidAuthorization(ctx, input) {
    const id = transactionIdOf(input.processorTransactionId);
    const { tx, errors } = await mutateTransaction(ctx, 'voidTransaction', 'VoidTransactionInput', {
      apiRequestKey: input.idempotencyKey,
      transactionId: id,
    });
    if (tx) return fromTransaction(tx, false, null);
    const current = await fetchTransaction(ctx, id);
    if (current && fromTransaction(current, false, null).status === 'voided')
      return fromTransaction(current, false, null);
    return refused(Money.zero(), errors);
  },

  async refund(ctx, input) {
    const id = transactionIdOf(input.processorTransactionId);
    const original = await fetchTransaction(ctx, id);
    if (!original)
      return refused(input.amount, [{ message: '', errorClass: 'NOT_FOUND', legacyCode: null }]);
    const status = str(original.status);
    if (status === 'SETTLING' || status === 'SETTLED') {
      const result = await graphql(
        ctx,
        'mutation R($input: RefundTransactionInput!) { refundTransaction(input: $input) { refund { id status amount { value } } } }',
        {
          input: {
            apiRequestKey: input.idempotencyKey,
            transactionId: id,
            refund: { amount: braintreeValue(input.amount) },
          },
        },
      );
      const refund = obj(obj(result.data?.refundTransaction)?.refund);
      const refundId = str(refund?.id);
      if (!refund || !refundId) {
        if (isTransient(result.errors)) throw new Error('braintree temporarily unavailable');
        return refused(input.amount, result.errors);
      }
      const state = str(refund.status);
      const ok = ['SUBMITTED_FOR_SETTLEMENT', 'SETTLING', 'SETTLED'].includes(String(state));
      return buildTransaction({
        status: ok ? 'refunded' : state === 'AUTHORIZING' ? 'pending' : 'declined',
        amount: input.amount,
        processorTransactionId: refundId,
        declineCategory: ok ? null : 'processor_error',
        rawCode: state,
      });
    }
    if (status === 'SUBMITTED_FOR_SETTLEMENT') {
      // Not yet settling: a refund is refused by Braintree, so a full refund is done as a void (docs section 5).
      const whole = fromTransaction(original, false, null);
      if (!whole.amount.eq(input.amount))
        return buildTransaction({
          status: 'declined',
          amount: input.amount,
          declineCategory: 'other',
          rawCode: 'REFUND_NOT_YET_SETTLED',
          message: 'A partial refund is possible once the payment starts settling (nightly).',
        });
      const voided = await this.voidAuthorization?.(ctx, {
        idempotencyKey: input.idempotencyKey,
        processorTransactionId: id,
      });
      return voided && voided.status === 'voided'
        ? buildTransaction({ status: 'refunded', amount: input.amount, processorTransactionId: id })
        : (voided ?? refused(input.amount, []));
    }
    return buildTransaction({
      status: 'declined',
      amount: input.amount,
      declineCategory: 'other',
      rawCode: status ?? 'UNKNOWN_STATUS',
      message: 'This payment cannot be refunded in its current state.',
    });
  },

  async getTransaction(ctx, id) {
    const tx = await fetchTransaction(ctx, id);
    if (!tx) throw new ValidationError('Braintree does not know this transaction.');
    return fromTransaction(tx, true, null);
  },

  verifyWebhook: (ctx, request) => verifyBraintreeWebhook(ctx, request),
  parseWebhook: (request) => parseBraintreeEvent(request.rawBody),
  cardIdentity: (transaction) => transaction.cardIdentity,
  mapDecline: mapBraintreeDecline,
});
