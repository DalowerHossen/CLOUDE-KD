// path: lib/payment/onboarding/nmi-signup.ts
// Client of NMI's Merchant Sign-Up API (docs/processors/nmi.md section 13): OAuth client credentials, packages, applications,
// legal consent, documents, submit and webhook subscriptions. The partner's client id and secret and every access token stay
// in this file and the memory of one server process; they are never logged or returned.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { parseJson, sendHttp } from '@/lib/payment/http-client';
import type { ProcessorEnvironment } from '@/types/contracts';

export type Json = Record<string, unknown>;

export const SIGNUP_BASE: Readonly<Record<ProcessorEnvironment, string>> = {
  sandbox: 'https://sandbox.signup.nmi.com/api/v1',
  live: 'https://secure.nmi.com/api/v5/signup',
};

const SCOPES = [
  'packages:read',
  'applications:read',
  'applications:write',
  'subscriptions:read',
  'subscriptions:write',
] as const;

export interface PartnerAccess {
  environment: ProcessorEnvironment;
  clientId: string;
  clientSecret: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}
const tokens = new Map<string, CachedToken>();
/** A token is renewed a minute before it ends (it lives 60 minutes). */
const RENEW_BEFORE_MS = 60_000;

const asObject = (value: unknown): Json | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;

async function accessToken(access: PartnerAccess, fresh: boolean): Promise<string> {
  const key = `${access.environment}:${access.clientId}`;
  const cached = tokens.get(key);
  if (!fresh && cached && cached.expiresAt - RENEW_BEFORE_MS > Date.now()) return cached.token;
  const response = await sendHttp({
    method: 'POST',
    url: `${SIGNUP_BASE[access.environment]}/oauth/token`,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: access.clientId,
      client_secret: access.clientSecret,
      scope: [...SCOPES],
    }),
  });
  if (response.status === 401 || response.status === 400)
    throw new ValidationError(
      'NMI did not accept the partner client ID and secret for this environment. Check the "Partner OAuth2 Apps" values.',
    );
  const body = parseJson(response.text);
  const token = typeof body?.access_token === 'string' ? body.access_token : '';
  if (response.status !== 200 || token === '')
    throw new InternalError(`NMI sign-up token request failed (${response.status}).`);
  const seconds = typeof body?.expires_in === 'number' ? body.expires_in : 3600;
  tokens.set(key, { token, expiresAt: Date.now() + seconds * 1000 });
  return token;
}

export interface SignupResult {
  status: number;
  body: Json;
}

interface CallOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: Json;
  /** Writes carry an idempotency key so that a retry after a timeout does not create a second record. */
  idempotent?: boolean;
  bytes?: { data: Uint8Array; contentType: string };
}

async function send(
  access: PartnerAccess,
  options: CallOptions,
  token: string,
  idempotencyKey: string,
): Promise<SignupResult> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
  };
  if (options.idempotent) headers['idempotency-key'] = idempotencyKey;
  if (options.bytes) headers['content-type'] = options.bytes.contentType;
  else if (options.body) headers['content-type'] = 'application/json';
  const response = await sendHttp({
    method: options.method,
    url: `${SIGNUP_BASE[access.environment]}${options.path}`,
    headers,
    ...(options.bytes
      ? { bodyBytes: options.bytes.data }
      : options.body
        ? { body: JSON.stringify(options.body) }
        : {}),
    timeoutMs: options.bytes ? 60_000 : 20_000,
  });
  return { status: response.status, body: parseJson(response.text) ?? {} };
}

/** One call with the partner token; a 401 renews the token once. A 5xx or 429 is reported as unavailable. */
export async function signupCall(
  access: PartnerAccess,
  options: CallOptions,
): Promise<SignupResult> {
  const idempotencyKey = randomUUID();
  let result = await send(access, options, await accessToken(access, false), idempotencyKey);
  if (result.status === 401)
    result = await send(access, options, await accessToken(access, true), idempotencyKey);
  if (result.status >= 500 || result.status === 429)
    throw new Error(`nmi sign-up unavailable (${result.status})`);
  if (result.status === 401)
    throw new ValidationError(
      'NMI refused the partner access token. Check the partner credentials.',
    );
  if (result.status === 404) throw new NotFoundError('NMI does not know this item.');
  return result;
}

/** The messages of a 422 or 400 answer, joined for display; secrets never appear in them. */
export function problemOf(body: Json): string {
  const errors = Array.isArray(body.errors)
    ? body.errors.filter((e): e is string => typeof e === 'string')
    : [];
  const message = typeof body.message === 'string' ? body.message : 'NMI refused the request.';
  return errors.length > 0 ? `${message} ${errors.slice(0, 5).join(' ')}` : message;
}

export function failIfRefused(result: SignupResult): Json {
  if (result.status >= 200 && result.status < 300) return result.body;
  throw new ValidationError(problemOf(result.body));
}

/** Multipart text of a single file upload with a type field, as the documents endpoint takes it. */
export function multipartDocument(
  type: string,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
): { data: Uint8Array; contentType: string } {
  const boundary = `kd${randomUUID().replace(/-/g, '')}`;
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\n${type}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    data: new Uint8Array(Buffer.concat([head, Buffer.from(bytes), tail])),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export const asJson = asObject;

const GATEWAY_ID = /^[A-Za-z0-9_-]{1,30}$/;

/**
 * Creates one key on a merchant account through the Partner API (docs/processors/nmi.md section 13a): POST
 * /v4/merchants/{gateway_id}/security_keys with the partner key in the Authorization header. `permission` is "transaction" (a
 * private key for the payment API) or "tokenization" (the public key of the browser form). The key text is returned once.
 */
export async function createMerchantKey(input: {
  apiBase: string;
  partnerKey: string;
  gatewayId: string;
  description: string;
  permission: 'transaction' | 'tokenization';
}): Promise<string> {
  if (!GATEWAY_ID.test(input.gatewayId))
    throw new ValidationError('The merchant gateway id is not valid.');
  const response = await sendHttp({
    method: 'POST',
    url: `${input.apiBase}/v4/merchants/${encodeURIComponent(input.gatewayId)}/security_keys`,
    headers: {
      authorization: input.partnerKey,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      description: input.description.slice(0, 100),
      permissions: [input.permission],
    }),
  });
  if (response.status === 401 || response.status === 403)
    throw new ValidationError('NMI did not accept the Partner API key (the "Partner Keys" box).');
  if (response.status >= 500 || response.status === 429)
    throw new Error(`nmi partner api unavailable (${response.status})`);
  const body = parseJson(response.text);
  const key = typeof body?.keyText === 'string' ? body.keyText : '';
  if (response.status < 200 || response.status >= 300 || key === '')
    throw new ValidationError(problemOf(body ?? {}));
  return key;
}
