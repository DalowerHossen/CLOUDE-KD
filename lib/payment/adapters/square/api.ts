// path: lib/payment/adapters/square/api.ts
// Square REST calls (docs/processors/square.md sections 2, 3, 5 and 10). Bearer access token, a pinned API version, JSON.
// The token never leaves this file and is never logged.
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

/** Latest version in Square's change log read on 2026-10-17. */
export const SQUARE_VERSION = '2026-09-16';

export function baseUrl(environment: 'sandbox' | 'live'): string {
  return environment === 'live'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

export function sdkUrl(environment: 'sandbox' | 'live'): string {
  return environment === 'live'
    ? 'https://web.squarecdn.com/v1/square.js'
    : 'https://sandbox.web.squarecdn.com/v1/square.js';
}

/** The core's key may be longer than Square's 45 character limit, so a fixed-length digest of it is sent. */
export function requestKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 40);
}

export interface SquareError {
  category: string;
  code: string;
  detail: string | null;
}

export interface ApiResult {
  status: number;
  body: Json;
  errors: SquareError[];
}

function readErrors(body: Json): SquareError[] {
  return list(body.errors).map((e) => ({
    category: str(e.category) ?? '',
    code: str(e.code) ?? '',
    detail: str(e.detail),
  }));
}

function accessToken(ctx: AdapterContext): string {
  const token = ctx.credentials.accessToken ?? '';
  if (token === '') throw new ValidationError('The Square access token is missing.');
  return token;
}

export async function squareCall(
  ctx: AdapterContext,
  method: 'GET' | 'POST',
  path: string,
  payload: Json | null,
): Promise<ApiResult> {
  const response = await sendHttp({
    method,
    url: `${baseUrl(ctx.environment)}${path}`,
    headers: {
      authorization: `Bearer ${accessToken(ctx)}`,
      'square-version': SQUARE_VERSION,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    ...(method === 'POST' ? { body: JSON.stringify(payload ?? {}) } : {}),
  });
  if (response.status >= 500 || response.status === 429) {
    throw new Error(`square unavailable (${response.status})`);
  }
  const body = parseJson(response.text) ?? {};
  const errors = readErrors(body);
  if (
    response.status === 401 ||
    errors.some((e) => e.category === 'AUTHENTICATION_ERROR' || e.code === 'INSUFFICIENT_SCOPES')
  ) {
    throw new ValidationError(
      'Square did not accept the access token for this environment (check the token and its permissions).',
    );
  }
  if (errors.some((e) => e.category === 'API_ERROR' || e.category === 'RATE_LIMIT_ERROR')) {
    throw new Error('square temporarily unavailable');
  }
  return { status: response.status, body, errors };
}
