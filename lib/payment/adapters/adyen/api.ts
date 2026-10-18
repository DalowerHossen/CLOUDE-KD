// path: lib/payment/adapters/adyen/api.ts
// Adyen Checkout API calls (docs/processors/adyen.md sections 2, 3, 5 and 10). The API key travels only in the
// `x-api-key` header and is never logged. Money is sent as integer minor units.
import 'server-only';
import { createHash } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { parseJson, sendHttp } from '@/lib/payment/http-client';
import type { AdapterContext } from '@/types/contracts';

export type Json = Record<string, unknown>;
export const obj = (v: unknown): Json | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
export const list = (v: unknown): Json[] =>
  Array.isArray(v) ? v.map(obj).filter((x): x is Json => x !== null) : [];

export const API_VERSION = 'v71';
export const SESSION_ID = /^[A-Za-z0-9]{8,64}$/;
export const SESSION_RESULT = /^[\x21-\x7E]{8,8192}$/;
export const PSP_REFERENCE = /^[A-Z0-9]{16}$/;

/** Browser resources of Adyen Web 6.46.0 with their Subresource Integrity hashes (docs section 3). */
export const WEB_VERSION = '6.46.0';
export const WEB_JS_INTEGRITY =
  'sha384-BWFAwV8ndpuOuMAiAu2fKA0Vj2lSBNRCVBKIV2K7G6hRT7+0CaXiFYZxkDgfwY7r';
export const WEB_CSS_INTEGRITY =
  'sha384-iqhFsakyeWB88YbaGEhZMvY6gJnakKalS52WEM1jya1sN8udUMNyKpfouOSmYVy/';
export const CDN_HOSTS: Readonly<Record<'sandbox' | 'live', string>> = {
  sandbox: 'https://checkoutshopper-test.cdn.adyen.com',
  live: 'https://checkoutshopper-live.cdn.adyen.com',
};

export function apiBase(ctx: AdapterContext): string {
  if (ctx.environment === 'sandbox') return `https://checkout-test.adyen.com/${API_VERSION}`;
  const prefix = ctx.credentials.livePrefix ?? '';
  if (!/^[A-Za-z0-9-]{8,100}$/.test(prefix))
    throw new ValidationError('The Adyen live URL prefix is missing or malformed.');
  return `https://${prefix}-checkout-live.adyenpayments.com/checkout/${API_VERSION}`;
}

export interface ApiResult {
  status: number;
  body: Json;
}

export async function adyenCall(
  ctx: AdapterContext,
  method: 'GET' | 'POST',
  path: string,
  bodyText: string | null,
  idempotencyKey: string | null = null,
): Promise<ApiResult> {
  const key = ctx.credentials.apiKey ?? '';
  if (key === '') throw new ValidationError('The Adyen API key is missing.');
  const response = await sendHttp({
    method,
    url: `${apiBase(ctx)}${path}`,
    headers: {
      'x-api-key': key,
      accept: 'application/json',
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...(idempotencyKey
        ? {
            'idempotency-key': createHash('sha256')
              .update(idempotencyKey)
              .digest('hex')
              .slice(0, 40),
          }
        : {}),
    },
    ...(method === 'POST' ? { body: bodyText ?? '{}' } : {}),
  });
  if (response.status >= 500 || response.status === 429)
    throw new Error(`adyen unavailable (${response.status})`);
  if (response.status === 401 || response.status === 403)
    throw new ValidationError(
      'Adyen did not accept the API key for this environment (check the key, its roles and the environment).',
    );
  return { status: response.status, body: parseJson(response.text) ?? {} };
}
