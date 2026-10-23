// path: lib/payment/adapters/verifone/api.ts
// Verifone REST calls (docs/processors/verifone.md sections 2, 3, 5 and 10). HTTP Basic with the user id and API key,
// JSON. Two services share one host per region: the Checkout service and the eCommerce API. The key never leaves this
// file and is never logged.
import 'server-only';
import { createHash } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { basicAuth, parseJson, sendHttp } from '@/lib/payment/http-client';
import type { AdapterContext } from '@/types/contracts';

export type Json = Record<string, unknown>;
export const obj = (v: unknown): Json | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
export const list = (v: unknown): Json[] =>
  Array.isArray(v) ? v.map(obj).filter((x): x is Json => x !== null) : [];

/** Region hosts of docs section 3. A sandbox account uses `global` or `us`; a live account uses `emea`, `us` or `nz`. */
const HOSTS: Readonly<Record<'sandbox' | 'live', Readonly<Record<string, string>>>> = {
  sandbox: {
    global: 'https://cst.test-gsc.vfims.com',
    us: 'https://uscst-gb.gsc.vficloud.net',
  },
  live: {
    emea: 'https://emea.gsc.verifone.cloud',
    us: 'https://us.gsc.verifone.cloud',
    nz: 'https://nz.gsc.verifone.cloud',
  },
};

export function hostOf(ctx: AdapterContext): string {
  const region = ctx.credentials.region ?? '';
  const host = HOSTS[ctx.environment][region];
  if (!host)
    throw new ValidationError(
      ctx.environment === 'live'
        ? 'The Verifone region for a live account must be emea, us or nz.'
        : 'The Verifone region for a sandbox account must be global or us.',
    );
  return host;
}

export const checkoutBase = (ctx: AdapterContext): string => `${hostOf(ctx)}/oidc/checkout-service`;
export const ecomBase = (ctx: AdapterContext): string => `${hostOf(ctx)}/oidc`;

/** Public keys that sign the notifications (docs section 9). */
export function jwksUrl(environment: 'sandbox' | 'live'): string {
  return environment === 'live'
    ? 'https://vf11gtostorage1.blob.core.windows.net/prod-webhook-sign-keys/prod-webhook-sign-keys.jwks'
    : 'https://vf11gtostorage1.blob.core.windows.net/test-webhook-sign-keys/test-webhook-sign-keys.jwks';
}

/**
 * The refund call takes the idempotency key as a UUID (docs section 10). A UUID-shaped value (version 5 layout) is
 * derived from the core's key, so a repeated request carries the same value.
 */
export function idempotencyUuid(key: string): string {
  const hex = createHash('sha256').update(key).digest('hex');
  // Variant bits 10xx: the first hex digit of the group is one of 8, 9, a, b.
  const variant = '89ab'.charAt('0123456789abcdef'.indexOf(hex.charAt(16)) % 4);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface ApiResult {
  status: number;
  body: Json;
  /** Verifone error code of a refused request (`code` of the error body), when present. */
  errorCode: string | null;
}

function authorization(ctx: AdapterContext): string {
  const user = ctx.credentials.userId ?? '';
  const key = ctx.credentials.apiKey ?? '';
  if (user === '' || key === '')
    throw new ValidationError('The Verifone user id or API key is missing.');
  return basicAuth(user, key);
}

export async function verifoneCall(
  ctx: AdapterContext,
  method: 'GET' | 'POST',
  url: string,
  payload: Json | null,
  extraHeaders: Readonly<Record<string, string>> = {},
): Promise<ApiResult> {
  const response = await sendHttp({
    method,
    url,
    headers: {
      authorization: authorization(ctx),
      accept: 'application/json',
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...extraHeaders,
    },
    ...(method === 'POST' ? { body: JSON.stringify(payload ?? {}) } : {}),
  });
  if (response.status >= 500 || response.status === 429) {
    throw new Error(`verifone unavailable (${response.status})`);
  }
  const body = parseJson(response.text) ?? {};
  const code = typeof body.code === 'number' ? String(body.code) : str(body.code);
  if (response.status === 401 || (response.status === 403 && code === '113')) {
    throw new ValidationError(
      'Verifone did not accept the user id and API key for this environment (check the key and the role of the user).',
    );
  }
  return { status: response.status, body, errorCode: code };
}
