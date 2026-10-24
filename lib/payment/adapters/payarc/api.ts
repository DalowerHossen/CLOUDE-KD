// path: lib/payment/adapters/payarc/api.ts
// PayArc REST calls (docs/processors/payarc.md sections 2, 3, 5 and 10). Bearer access token, JSON. The token never
// leaves this file and is never logged.
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

export function apiBase(environment: 'sandbox' | 'live'): string {
  return environment === 'live' ? 'https://api.payarc.net/v1' : 'https://testapi.payarc.net/v1';
}

/**
 * Hosted Fields script. Only the sandbox address is documented; the production address is blocker B3, so a live
 * account gets no address and no checkout session.
 */
export const PAYARC_SCRIPT_URLS: Readonly<Record<'sandbox' | 'live', string | null>> = {
  sandbox: 'https://testportal.payarc.net/js/iframeprocess.js',
  live: null,
};

/** The charge call accepts any unique value; a fixed-length digest of the core's key avoids unknown length limits. */
export function requestKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 40);
}

export interface ApiResult {
  status: number;
  body: Json;
}

function bearer(ctx: AdapterContext): string {
  const token = ctx.credentials.accessToken ?? '';
  if (token === '') throw new ValidationError('The PayArc access token is missing.');
  return `Bearer ${token}`;
}

export async function payarcCall(
  ctx: AdapterContext,
  method: 'GET' | 'POST',
  path: string,
  payload: Json | null,
  extraHeaders: Readonly<Record<string, string>> = {},
): Promise<ApiResult> {
  const response = await sendHttp({
    method,
    url: `${apiBase(ctx.environment)}${path}`,
    headers: {
      authorization: bearer(ctx),
      accept: 'application/json',
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...extraHeaders,
    },
    ...(method === 'POST' ? { body: JSON.stringify(payload ?? {}) } : {}),
  });
  if (response.status >= 500 || response.status === 429) {
    throw new Error(`payarc unavailable (${response.status})`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ValidationError(
      'PayArc did not accept the access token for this environment (check the token and the environment).',
    );
  }
  return { status: response.status, body: parseJson(response.text) ?? {} };
}
