// path: lib/payment/adapters/paypal/api.ts
// PayPal REST calls: OAuth token (cached in memory for its lifetime, never logged) and JSON requests.
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

export function baseUrl(ctx: AdapterContext): string {
  return ctx.environment === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

export function sdkUrl(environment: 'sandbox' | 'live'): string {
  return environment === 'live'
    ? 'https://www.paypal.com/web-sdk/v6/core'
    : 'https://www.sandbox.paypal.com/web-sdk/v6/core';
}

function credentials(ctx: AdapterContext): { id: string; secret: string } {
  const id = ctx.credentials.clientId ?? '';
  const secret = ctx.credentials.clientSecret ?? '';
  if (id === '' || secret === '')
    throw new ValidationError('The PayPal client id or secret is missing.');
  return { id, secret };
}

interface CachedToken {
  token: string;
  expiresAt: number;
}
const tokens = new Map<string, CachedToken>();
const REFRESH_MARGIN_MS = 120_000;

export function clearTokenCache(): void {
  tokens.clear();
}

async function requestToken(
  ctx: AdapterContext,
  form: string,
): Promise<{ token: string; expiresInMs: number }> {
  const { id, secret } = credentials(ctx);
  const response = await sendHttp({
    method: 'POST',
    url: `${baseUrl(ctx)}/v1/oauth2/token`,
    headers: {
      authorization: basicAuth(id, secret),
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: form,
  });
  if (response.status === 401 || response.status === 400 || response.status === 403) {
    throw new ValidationError(
      'PayPal did not accept the client id and secret for this environment.',
    );
  }
  if (response.status !== 200) throw new Error(`paypal token unavailable (${response.status})`);
  const body = parseJson(response.text);
  const token = str(body?.access_token);
  if (!token) throw new Error('paypal token missing');
  const seconds = typeof body?.expires_in === 'number' ? body.expires_in : 300;
  return { token, expiresInMs: seconds * 1000 };
}

/** Access token for server calls. */
export async function accessToken(ctx: AdapterContext): Promise<string> {
  const { id, secret } = credentials(ctx);
  const key = `${ctx.environment}:${id}:${createHash('sha256').update(secret).digest('hex').slice(0, 16)}`;
  const cached = tokens.get(key);
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) return cached.token;
  const fresh = await requestToken(ctx, 'grant_type=client_credentials&response_type=token');
  tokens.set(key, { token: fresh.token, expiresAt: Date.now() + fresh.expiresInMs });
  return fresh.token;
}

/** Browser-safe token for the SDK (documented form body `response_type=client_token&intent=sdk_init`). */
export async function browserToken(ctx: AdapterContext): Promise<string> {
  return (
    await requestToken(
      ctx,
      'grant_type=client_credentials&response_type=client_token&intent=sdk_init',
    )
  ).token;
}

export interface ApiResult {
  status: number;
  body: Json;
}

export async function paypalCall(
  ctx: AdapterContext,
  method: 'GET' | 'POST',
  path: string,
  payload: Json | null,
  requestId: string | null,
): Promise<ApiResult> {
  const token = await accessToken(ctx);
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    prefer: 'return=representation',
  };
  if (method === 'POST') {
    headers['content-type'] = 'application/json';
    if (requestId) headers['paypal-request-id'] = requestId;
  }
  const response = await sendHttp({
    method,
    url: `${baseUrl(ctx)}${path}`,
    headers,
    ...(method === 'POST' ? { body: JSON.stringify(payload ?? {}) } : {}),
  });
  if (response.status === 401 || response.status === 403) {
    tokens.clear();
    throw new ValidationError('PayPal did not accept the request (check the app permissions).');
  }
  if (response.status >= 500 || response.status === 429)
    throw new Error(`paypal unavailable (${response.status})`);
  return { status: response.status, body: parseJson(response.text) ?? {} };
}

/** The first issue name of an error body (`details[0].issue`), or the error name. */
export function errorIssue(body: Json): string | null {
  const first = list(body.details)[0];
  return str(first?.issue) ?? str(body.name);
}
