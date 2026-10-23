// path: lib/payment/adapters/authorizenet/api.ts
// Authorize.Net JSON API calls (docs/processors/authorizenet.md sections 2, 3 and 5). One POST URL, credentials in the
// body, and the schema's element order must be kept (object keys below are written in that order). Nothing from the
// credentials is logged or returned.
import 'server-only';
import { createHash } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { sendHttp } from '@/lib/payment/http-client';
import type { AdapterContext } from '@/types/contracts';

export type Json = Record<string, unknown>;
export const obj = (v: unknown): Json | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
export const list = (v: unknown): Json[] =>
  Array.isArray(v) ? v.map(obj).filter((x): x is Json => x !== null) : [];

export function endpoint(environment: 'sandbox' | 'live'): string {
  return environment === 'live'
    ? 'https://api.authorize.net/xml/v1/request.api'
    : 'https://apitest.authorize.net/xml/v1/request.api';
}

/** Hosted payment form script for the environment (docs section 3). */
export function acceptUiUrl(environment: 'sandbox' | 'live'): string {
  return environment === 'live'
    ? 'https://js.authorize.net/v3/AcceptUI.js'
    : 'https://jstest.authorize.net/v3/AcceptUI.js';
}

/** `refId` (up to 20 characters) derived from the core's key, echoed in responses and webhooks. */
export function referenceId(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 20);
}

export interface AnetResult {
  /** Top-level result: `Ok` or `Error`. */
  resultCode: string;
  /** First top-level message code, for example `I00001` or `E00027`. */
  messageCode: string | null;
  transaction: Json | null;
  body: Json;
}

const CREDENTIAL_CODES: ReadonlySet<string> = new Set([
  'E00006',
  'E00007',
  'E00008',
  'E00010',
  'E00011',
]);

function authentication(ctx: AdapterContext): Json {
  const name = ctx.credentials.apiLoginId ?? '';
  const transactionKey = ctx.credentials.transactionKey ?? '';
  if (name === '' || transactionKey === '')
    throw new ValidationError('The Authorize.Net API Login ID or Transaction Key is missing.');
  return { name, transactionKey };
}

/** Sends `{ <requestName>: { merchantAuthentication, refId?, ...fields } }`; `fields` must already be in schema order. */
export async function anetCall(
  ctx: AdapterContext,
  requestName: string,
  refId: string | null,
  fields: Json,
): Promise<AnetResult> {
  const request = {
    [requestName]: {
      merchantAuthentication: authentication(ctx),
      ...(refId ? { refId } : {}),
      ...fields,
    },
  };
  const response = await sendHttp({
    method: 'POST',
    url: endpoint(ctx.environment),
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(request),
    timeoutMs: 45_000,
  });
  if (response.status >= 500 || response.status === 429)
    throw new Error(`authorizenet unavailable (${response.status})`);
  // The answer may start with a byte order mark (docs section 13).
  const raw = response.text;
  const text = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim();
  let body: Json | null = null;
  try {
    body = obj(JSON.parse(text) as unknown);
  } catch {
    body = null;
  }
  if (!body) throw new Error(`authorizenet answered without JSON (${response.status})`);
  const messages = obj(body.messages);
  const first = list(messages?.message)[0];
  const messageCode = str(first?.code);
  if (messageCode && CREDENTIAL_CODES.has(messageCode)) {
    throw new ValidationError(
      'Authorize.Net did not accept the API Login ID and Transaction Key for this environment.',
    );
  }
  return {
    resultCode: str(messages?.resultCode) ?? 'Error',
    messageCode,
    transaction: obj(body.transactionResponse),
    body,
  };
}
