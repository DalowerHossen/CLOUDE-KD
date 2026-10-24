// path: lib/payment/adapters/paddle/api.ts
// Paddle Billing REST calls (docs/processors/paddle.md sections 2, 3, 5 and 10). Bearer API key, JSON. The key never
// leaves this file and is never logged.
import 'server-only';
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
  return environment === 'live' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';
}

export interface ApiResult {
  status: number;
  /** The `data` member of a successful answer, or null. */
  data: Json | null;
  /** The `data` member when it is a list. */
  items: Json[];
  /** Error code of a refused request (`error.code`), when present. */
  errorCode: string | null;
  errorType: string | null;
}

function bearer(ctx: AdapterContext): string {
  const key = ctx.credentials.apiKey ?? '';
  if (key === '') throw new ValidationError('The Paddle API key is missing.');
  return `Bearer ${key}`;
}

export async function paddleCall(
  ctx: AdapterContext,
  method: 'GET' | 'POST',
  path: string,
  payload: Json | null,
): Promise<ApiResult> {
  const response = await sendHttp({
    method,
    url: `${apiBase(ctx.environment)}${path}`,
    headers: {
      authorization: bearer(ctx),
      accept: 'application/json',
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(payload ?? {}) } : {}),
  });
  if (response.status >= 500 || response.status === 429) {
    throw new Error(`paddle unavailable (${response.status})`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ValidationError(
      'Paddle did not accept the API key for this environment (check the key, its permissions and the environment).',
    );
  }
  const body = parseJson(response.text) ?? {};
  const error = obj(body.error);
  return {
    status: response.status,
    data: obj(body.data),
    items: Array.isArray(body.data) ? list(body.data) : [],
    errorCode: str(error?.code),
    errorType: str(error?.type),
  };
}
