// path: lib/payment/adapters/stripe.ts
// Stripe adapter (docs/processors/stripe.md). Payment Element with a deferred intent: the browser gives us a
// ConfirmationToken, the server creates and confirms a manual-capture PaymentIntent. No card data reaches this code.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { basicAuth, parseJson, sendHttp } from '@/lib/payment/http-client';
import {
  buildTransaction,
  defineAdapter,
  fromMinorUnits,
  NO_THREE_DS,
  toMinorUnits,
} from '@/lib/payment/adapters/base';
import type {
  AdapterContext,
  AuthorizeInput,
  CardIdentity,
  DeclineCategory,
  ProcessorAdapter,
  ProcessorTransaction,
  ThreeDSPolicy,
  ThreeDSResult,
} from '@/types/contracts';
import { encodeForm, type FormObject } from './stripe/form';
import { parseStripeEvent, verifyStripeSignature } from './stripe/webhook';

const BASE = 'https://api.stripe.com';
/** The API version named as current on https://docs.stripe.com/api/versioning when this adapter was written. */
export const STRIPE_API_VERSION = '2026-09-30.endive';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

function keyMode(secretKey: string): 'sandbox' | 'live' {
  return /^(sk|rk)_test_/.test(secretKey) ? 'sandbox' : 'live';
}

/** Sandbox and live keys are never mixed: the key must belong to the environment the processor is set to. */
function assertEnvironment(ctx: AdapterContext): string {
  const secret = ctx.credentials.secretKey ?? '';
  if (secret === '') throw new ValidationError('The Stripe secret key is missing.');
  if (keyMode(secret) !== ctx.environment) {
    throw new ValidationError('The Stripe key does not belong to the selected environment.');
  }
  const pub = ctx.credentials.publishableKey ?? '';
  if (pub !== '' && (pub.startsWith('pk_test_') ? 'sandbox' : 'live') !== ctx.environment) {
    throw new ValidationError(
      'The Stripe publishable key does not belong to the selected environment.',
    );
  }
  return secret;
}

interface CallResult {
  status: number;
  body: Json;
}

async function call(
  ctx: AdapterContext,
  method: 'GET' | 'POST',
  path: string,
  params: FormObject | null,
  idempotencyKey: string | null,
): Promise<CallResult> {
  const secret = assertEnvironment(ctx);
  const headers: Record<string, string> = {
    authorization: basicAuth(secret),
    'stripe-version': STRIPE_API_VERSION,
    accept: 'application/json',
  };
  let url = `${BASE}${path}`;
  let body: string | undefined;
  if (method === 'POST') {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    body = encodeForm(params ?? {});
  } else if (params) {
    url += `?${encodeForm(params)}`;
  }
  const response = await sendHttp({
    method,
    url,
    headers,
    ...(body !== undefined ? { body } : {}),
  });
  const parsed = parseJson(response.text) ?? {};
  if (response.status === 401 || response.status === 403) {
    throw new ValidationError('Stripe did not accept the key (check its permissions).');
  }
  if (response.status >= 500 || response.status === 429 || response.status === 424) {
    throw new Error(`stripe unavailable (${response.status})`);
  }
  return { status: response.status, body: parsed };
}

const DECLINE_MAP: Readonly<Record<string, DeclineCategory>> = {
  insufficient_funds: 'insufficient_funds',
  incorrect_number: 'invalid_number',
  invalid_number: 'invalid_number',
  expired_card: 'invalid_expiry',
  invalid_expiry_month: 'invalid_expiry',
  invalid_expiry_year: 'invalid_expiry',
  incorrect_cvc: 'invalid_cvv',
  invalid_cvc: 'invalid_cvv',
  authentication_required: 'three_ds_failed',
  authentication_not_handled: 'three_ds_failed',
  payment_intent_authentication_failure: 'three_ds_failed',
  fraudulent: 'processor_fraud_signal',
  stolen_card: 'processor_fraud_signal',
  lost_card: 'processor_fraud_signal',
  pickup_card: 'processor_fraud_signal',
  merchant_blacklist: 'processor_fraud_signal',
  do_not_honor: 'do_not_honor',
  generic_decline: 'do_not_honor',
  call_issuer: 'do_not_honor',
  restricted_card: 'do_not_honor',
  payment_method_restricted: 'do_not_honor',
  payment_method_provider_decline: 'do_not_honor',
  not_permitted: 'do_not_honor',
  transaction_not_allowed: 'do_not_honor',
  processing_error: 'processor_error',
  issuer_not_available: 'processor_error',
  payment_method_not_available: 'processor_error',
  payment_method_provider_timeout: 'processor_error',
  rate_limit: 'processor_error',
};

export function mapStripeDecline(raw: {
  code: string | null;
  message: string | null;
}): DeclineCategory {
  return (raw.code && DECLINE_MAP[raw.code]) || 'other';
}

function threeDsResult(requested: boolean, charge: Json | null): ThreeDSResult {
  const card = obj(obj(charge?.payment_method_details)?.card);
  const secure = obj(card?.three_d_secure);
  if (!secure) return { ...NO_THREE_DS, requested };
  const result = str(secure.result);
  return {
    requested,
    completed: result !== null,
    authenticated: result === 'authenticated',
    liabilityShift: null,
  };
}

function identityOf(charge: Json | null, error: Json | null): CardIdentity | null {
  const fromCharge = str(obj(obj(charge?.payment_method_details)?.card)?.fingerprint);
  const fromError = str(obj(obj(error?.payment_method)?.card)?.fingerprint);
  const value = fromCharge ?? fromError;
  return value ? { type: 'fingerprint', value } : null;
}

function postalCheck(charge: Json | null): boolean | null {
  const check = str(
    obj(obj(obj(charge?.payment_method_details)?.card)?.checks)?.address_postal_code_check,
  );
  if (check === 'pass') return true;
  if (check === 'fail') return false;
  return null;
}

/** Turns a PaymentIntent (with `latest_charge` expanded) and an optional error object into a transaction. */
export function fromIntent(pi: Json, error: Json | null, requested: boolean): ProcessorTransaction {
  const amountMinor =
    pi.amount_capturable && pi.status === 'requires_capture' ? pi.amount_capturable : pi.amount;
  const amount = fromMinorUnits(typeof amountMinor === 'number' ? amountMinor : 0);
  const charge = obj(pi.latest_charge);
  const lastError = obj(pi.last_payment_error) ?? error;
  const common = {
    amount,
    processorTransactionId: str(pi.id),
    threeDS: threeDsResult(requested, charge),
    avsPostalCodeMatch: postalCheck(charge),
    cardIdentity: identityOf(charge, lastError),
  };
  switch (pi.status) {
    case 'requires_capture':
      return buildTransaction({ status: 'authorized', ...common });
    case 'succeeded':
      return buildTransaction({ status: 'captured', ...common });
    case 'processing':
      return buildTransaction({ status: 'pending', ...common });
    case 'canceled':
      return buildTransaction({ status: 'voided', ...common });
    case 'requires_action': {
      const action = obj(pi.next_action);
      const redirect = obj(action?.redirect_to_url);
      const url = str(redirect?.url);
      if (action?.type === 'redirect_to_url' && url) {
        return buildTransaction({
          status: 'requires_action',
          ...common,
          requiredAction: { kind: 'redirect', url, clientSecret: null },
        });
      }
      return buildTransaction({
        status: 'requires_action',
        ...common,
        requiredAction: { kind: 'sdk_challenge', url: null, clientSecret: str(pi.client_secret) },
      });
    }
    case 'requires_confirmation':
      return buildTransaction({
        status: 'error',
        ...common,
        declineCategory: 'processor_error',
        message: 'The payment was not confirmed.',
      });
    case 'requires_payment_method':
    default: {
      const code = str(lastError?.decline_code) ?? str(lastError?.code);
      const category = code
        ? mapStripeDecline({ code, message: str(lastError?.message) })
        : 'three_ds_failed';
      return buildTransaction({
        status: 'declined',
        ...common,
        declineCategory: category,
        rawCode: code,
        message: str(lastError?.message),
      });
    }
  }
}

const THREE_DS_REQUEST: Readonly<Record<ThreeDSPolicy, string>> = {
  preferred: 'any',
  required: 'challenge',
  disabled: 'automatic',
};

function failureFrom(result: CallResult, requested: boolean): ProcessorTransaction {
  const error = obj(result.body.error);
  const pi = obj(error?.payment_intent);
  if (pi)
    return fromIntent({ ...pi, status: pi.status ?? 'requires_payment_method' }, error, requested);
  const code = str(error?.decline_code) ?? str(error?.code);
  return buildTransaction({
    status: 'declined',
    amount: fromMinorUnits(0),
    declineCategory: code ? mapStripeDecline({ code, message: null }) : 'other',
    rawCode: code,
    message: str(error?.message),
    cardIdentity: identityOf(null, error),
  });
}

async function authorize(
  ctx: AdapterContext,
  input: AuthorizeInput,
): Promise<ProcessorTransaction> {
  const requested = input.threeDS !== 'disabled';
  const result = await call(
    ctx,
    'POST',
    '/v1/payment_intents',
    {
      amount: toMinorUnits(input.amount),
      currency: 'usd',
      capture_method: 'manual',
      confirm: true,
      confirmation_token: input.paymentToken,
      return_url: input.returnUrl,
      payment_method_options: { card: { request_three_d_secure: THREE_DS_REQUEST[input.threeDS] } },
      metadata: { ...input.metadata },
      expand: ['latest_charge'],
    },
    input.idempotencyKey,
  );
  if (result.status >= 200 && result.status < 300) return fromIntent(result.body, null, requested);
  return failureFrom(result, requested);
}

async function retrieve(ctx: AdapterContext, id: string): Promise<ProcessorTransaction> {
  if (!/^pi_[A-Za-z0-9]{6,80}$/.test(id))
    throw new ValidationError('Not a Stripe PaymentIntent id.');
  const result = await call(
    ctx,
    'GET',
    `/v1/payment_intents/${id}`,
    { expand: ['latest_charge'] },
    null,
  );
  if (result.status === 404) throw new ValidationError('Stripe does not know this payment.');
  return fromIntent(result.body, null, true);
}

export const adapter: ProcessorAdapter = defineAdapter({
  id: 'stripe',
  displayName: 'Stripe',
  capabilities: {
    supportsAuthCapture: true,
    supportsThreeDS: true,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: false,
    modes: [{ id: 'default', label: 'Payment Element', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'secretKey',
      label: 'Secret key',
      secret: true,
      required: true,
      pattern: '^(sk|rk)_(test|live)_[A-Za-z0-9_]{16,}$',
      helpText: 'Starts with sk_test_ or rk_live_. Use a test key for the sandbox environment.',
    },
    {
      key: 'publishableKey',
      label: 'Publishable key',
      secret: false,
      required: true,
      pattern: '^pk_(test|live)_[A-Za-z0-9_]{16,}$',
      helpText: 'Starts with pk_test_ or pk_live_.',
    },
    {
      key: 'webhookSecret',
      label: 'Webhook signing secret',
      secret: true,
      required: true,
      pattern: '^whsec_[A-Za-z0-9_]{16,}$',
      helpText:
        'Starts with whsec_. Shown when you add the webhook endpoint in the Stripe Dashboard.',
    },
  ],

  async testConnection(ctx) {
    try {
      const result = await call(ctx, 'GET', '/v1/payment_intents', { limit: 1 }, null);
      if (result.status === 200)
        return {
          ok: true,
          message: 'Stripe accepted the key.',
          details: { mode: ctx.environment },
        };
      return { ok: false, message: 'Stripe did not accept the request.' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof ValidationError ? error.message : 'Stripe could not be reached.',
      };
    }
  },

  async createCheckoutSession(ctx, input) {
    assertEnvironment(ctx);
    return {
      clientConfig: {
        publishableKey: ctx.credentials.publishableKey ?? '',
        amount: toMinorUnits(input.amount),
        currency: 'usd',
        captureMethod: 'manual',
      },
      expiresAt: null,
    };
  },

  authorize,

  async capture(ctx, input) {
    const result = await call(
      ctx,
      'POST',
      `/v1/payment_intents/${encodeURIComponent(input.processorTransactionId)}/capture`,
      { amount_to_capture: toMinorUnits(input.amount), expand: ['latest_charge'] },
      input.idempotencyKey,
    );
    if (result.status >= 200 && result.status < 300) return fromIntent(result.body, null, true);
    return failureFrom(result, true);
  },

  async voidAuthorization(ctx, input) {
    const result = await call(
      ctx,
      'POST',
      `/v1/payment_intents/${encodeURIComponent(input.processorTransactionId)}/cancel`,
      {},
      input.idempotencyKey,
    );
    if (result.status >= 200 && result.status < 300) return fromIntent(result.body, null, true);
    return failureFrom(result, true);
  },

  async refund(ctx, input) {
    const result = await call(
      ctx,
      'POST',
      '/v1/refunds',
      {
        payment_intent: input.processorTransactionId,
        amount: toMinorUnits(input.amount),
        ...(input.reason ? { metadata: { reason: input.reason.slice(0, 200) } } : {}),
      },
      input.idempotencyKey,
    );
    const body = result.body;
    if (result.status >= 200 && result.status < 300) {
      const state = str(body.status);
      return buildTransaction({
        status:
          state === 'succeeded'
            ? 'refunded'
            : state === 'pending' || state === 'requires_action'
              ? 'pending'
              : 'declined',
        amount: input.amount,
        processorTransactionId: str(body.id),
        declineCategory: state === 'failed' || state === 'canceled' ? 'processor_error' : null,
        rawCode: str(body.failure_reason),
      });
    }
    const error = obj(body.error);
    return buildTransaction({
      status: 'declined',
      amount: input.amount,
      declineCategory: 'other',
      rawCode: str(error?.code),
      message: str(error?.message),
    });
  },

  getTransaction: retrieve,

  async verifyWebhook(ctx, request) {
    return verifyStripeSignature(
      ctx.credentials.webhookSecret ?? '',
      request.headers['stripe-signature'],
      request.rawBody,
      (Date.now() - (Date.now() % 1000)) / 1000,
    );
  },
  parseWebhook: (request) => parseStripeEvent(request.rawBody),
  cardIdentity: (transaction) => transaction.cardIdentity,
  mapDecline: mapStripeDecline,
});
