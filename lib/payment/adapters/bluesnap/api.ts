// path: lib/payment/adapters/bluesnap/api.ts
// BlueSnap REST calls (docs/processors/bluesnap.md sections 2, 3, 5 and 10). HTTP Basic with the API user key and
// password, a pinned API version, JSON. The password never leaves this file and is never logged.
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

export function apiBase(environment: 'sandbox' | 'live'): string {
  return environment === 'live' ? 'https://ws.bluesnap.com' : 'https://sandbox.bluesnap.com';
}

/** Browser domain of Hosted Payment Fields (docs section 3). */
export function payDomain(environment: 'sandbox' | 'live'): string {
  return environment === 'live' ? 'https://pay.bluesnap.com' : 'https://sandpay.bluesnap.com';
}

export function scriptUrl(environment: 'sandbox' | 'live'): string {
  return `${payDomain(environment)}/web-sdk/5/bluesnap.js`;
}

/** The idempotency header allows 64 characters of letters, digits and hyphens: a fixed digest of the core's key. */
export function requestKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 40);
}

export interface BlueSnapError {
  errorName: string;
  code: string | null;
  description: string | null;
}

export interface ApiResult {
  status: number;
  body: Json;
  headers: Readonly<Record<string, string>>;
  errors: BlueSnapError[];
}

function readErrors(body: Json): BlueSnapError[] {
  return list(body.message).map((m) => ({
    errorName: str(m.errorName) ?? '',
    code: m.code === undefined || m.code === null ? null : String(m.code),
    description: str(m.description),
  }));
}

function credentials(ctx: AdapterContext): string {
  const user = ctx.credentials.apiUsername ?? '';
  const password = ctx.credentials.apiPassword ?? '';
  if (user === '' || password === '')
    throw new ValidationError('The BlueSnap API user key or password is missing.');
  return basicAuth(user, password);
}

export async function bluesnapCall(
  ctx: AdapterContext,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  payload: Json | null,
  idempotencyKey: string | null,
): Promise<ApiResult> {
  const headers: Record<string, string> = {
    authorization: credentials(ctx),
    'bluesnap-version': '3.0',
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (idempotencyKey) headers['idempotency-key'] = requestKey(idempotencyKey);
  const response = await sendHttp({
    method,
    url: `${apiBase(ctx.environment)}${path}`,
    headers,
    ...(method === 'GET' ? {} : { body: JSON.stringify(payload ?? {}) }),
    timeoutMs: 45_000,
  });
  // Overload (429, 503), a running request with the same key (409) and server errors can be retried with the same key.
  if (response.status >= 500 || response.status === 429 || response.status === 409)
    throw new Error(`bluesnap unavailable (${response.status})`);
  if (response.status === 401)
    throw new ValidationError(
      'BlueSnap did not accept the API user key and password for this environment.',
    );
  const body = parseJson(response.text) ?? {};
  return { status: response.status, body, headers: response.headers, errors: readErrors(body) };
}
