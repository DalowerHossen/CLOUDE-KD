// path: lib/payment/onboarding/stripe-connect.ts
// Stripe Connect calls of the platform (docs/processors/stripe.md section 13): connected accounts (Accounts v2), the hosted
// onboarding link, the state of the card payments capability, and webhook endpoints. Every call uses the platform's own secret key
// (docs.stripe.com, "Make API calls for connected accounts"); the key stays in this file's callers and is never logged.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { encodeForm, type FormObject } from '@/lib/payment/adapters/stripe/form';
import { STRIPE_API_VERSION } from '@/lib/payment/adapters/stripe';
import { basicAuth, parseJson, sendHttp } from '@/lib/payment/http-client';

type Json = Record<string, unknown>;
const BASE = 'https://api.stripe.com';
const obj = (v: unknown): Json | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export const CONNECTED_ACCOUNT_ID = /^acct_[A-Za-z0-9]{8,40}$/;

export interface StripeResult {
  status: number;
  body: Json;
}

/** The message Stripe gives for a refused request; it never contains the key. */
export function stripeProblem(body: Json): string {
  const error = obj(body.error);
  const message = str(error?.message) ?? str(body.message) ?? 'Stripe refused the request.';
  return message.slice(0, 300);
}

function failIfRefused(result: StripeResult): Json {
  if (result.status >= 200 && result.status < 300) return result.body;
  throw new ValidationError(stripeProblem(result.body));
}

async function send(
  secretKey: string,
  method: 'GET' | 'POST',
  path: string,
  options: { json?: Json; form?: FormObject; query?: string },
): Promise<StripeResult> {
  const headers: Record<string, string> = {
    authorization: options.json ? `Bearer ${secretKey}` : basicAuth(secretKey),
    'stripe-version': STRIPE_API_VERSION,
    accept: 'application/json',
  };
  let body: string | undefined;
  if (options.json) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = encodeForm(options.form);
  }
  const response = await sendHttp({
    method,
    url: `${BASE}${path}${options.query ? `?${options.query}` : ''}`,
    headers,
    ...(body !== undefined ? { body } : {}),
  });
  if (response.status === 401 || response.status === 403)
    throw new ValidationError('Stripe did not accept the platform key (check its permissions).');
  if (response.status >= 500 || response.status === 429)
    throw new Error(`stripe unavailable (${response.status})`);
  return { status: response.status, body: parseJson(response.text) ?? {} };
}

/**
 * Creates the company's own Stripe account as a connected account with a full Stripe Dashboard: the merchant of record is the
 * company, Stripe collects the fees and carries the loss liability (the "Stripe-owned pricing" SaaS setup of
 * docs.stripe.com/connect/saas, and the request body of the SaaS quickstart). Returns the account id (`acct_...`).
 */
export async function createConnectedAccount(
  secretKey: string,
  input: { email: string; displayName: string; country: string },
): Promise<string> {
  const body = failIfRefused(
    await send(secretKey, 'POST', '/v2/core/accounts', {
      json: {
        contact_email: input.email,
        display_name: input.displayName,
        dashboard: 'full',
        identity: { country: input.country.toLowerCase(), entity_type: 'company' },
        configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
        defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } },
      },
    }),
  );
  const id = str(body.id) ?? '';
  if (!CONNECTED_ACCOUNT_ID.test(id))
    throw new ValidationError('Stripe answered without an account id.');
  return id;
}

/** A single-use link to Stripe's hosted onboarding for one connected account. Give it only to the authenticated account holder. */
export async function createOnboardingLink(
  secretKey: string,
  input: { accountId: string; returnUrl: string; refreshUrl: string },
): Promise<string> {
  const body = failIfRefused(
    await send(secretKey, 'POST', '/v2/core/account_links', {
      json: {
        account: input.accountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations: ['merchant'],
            return_url: input.returnUrl,
            refresh_url: input.refreshUrl,
          },
        },
      },
    }),
  );
  const url = str(body.url) ?? '';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('Stripe answered without an onboarding address.');
  }
  if (parsed.protocol !== 'https:' || !/(^|\.)stripe\.com$/.test(parsed.hostname))
    throw new ValidationError('Stripe answered with an unexpected onboarding address.');
  return parsed.toString();
}

/** The state of the card payments capability of a connected account: "active" means it can take card payments. */
export async function cardPaymentsStatus(secretKey: string, accountId: string): Promise<string> {
  if (!CONNECTED_ACCOUNT_ID.test(accountId)) throw new ValidationError('Not a Stripe account id.');
  const body = failIfRefused(
    await send(secretKey, 'GET', `/v2/core/accounts/${accountId}`, {
      query: 'include%5B0%5D=configuration.merchant',
    }),
  );
  const merchant = obj(obj(body.configuration)?.merchant);
  const status = str(obj(obj(merchant?.capabilities)?.card_payments)?.status);
  return status ?? 'not_requested';
}

/**
 * Adds a webhook endpoint (POST /v1/webhook_endpoints): `connect` true makes an endpoint for the events of all connected
 * accounts. The answer carries the signing secret (`whsec_...`), shown by Stripe only here.
 */
export async function createWebhookEndpoint(
  secretKey: string,
  input: { url: string; events: readonly string[]; connect: boolean; description: string },
): Promise<{ id: string; secret: string }> {
  const form: FormObject = {
    url: input.url,
    enabled_events: [...input.events],
    description: input.description,
    ...(input.connect ? { connect: 'true' } : {}),
  };
  const body = failIfRefused(await send(secretKey, 'POST', '/v1/webhook_endpoints', { form }));
  const secret = str(body.secret) ?? '';
  if (!/^whsec_[A-Za-z0-9_]{16,}$/.test(secret))
    throw new ValidationError('Stripe answered without a signing secret.');
  return { id: str(body.id) ?? '', secret };
}
