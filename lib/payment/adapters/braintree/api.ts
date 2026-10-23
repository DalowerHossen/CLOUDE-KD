// path: lib/payment/adapters/braintree/api.ts
// Braintree GraphQL calls (docs/processors/braintree.md sections 2, 3 and 5). One POST endpoint; the HTTP status is 200
// even for errors, so the `errors` array carries the outcome. Keys are never logged and never leave this file.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { basicAuth, parseJson, sendHttp } from '@/lib/payment/http-client';
import type { AdapterContext } from '@/types/contracts';

export type Json = Record<string, unknown>;
export const obj = (v: unknown): Json | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
export const list = (v: unknown): Json[] =>
  Array.isArray(v) ? v.map(obj).filter((x): x is Json => x !== null) : [];

/** The API version date sent with every request (docs section 2: the date the integration started). */
export const BRAINTREE_VERSION = '2026-10-17';

/** The browser SDK version named by the pages read (docs section 3). */
export const SDK_BASE = 'https://js.braintreegateway.com/web/3.146.0/js';

export function endpoint(environment: 'sandbox' | 'live'): string {
  return environment === 'live'
    ? 'https://payments.braintree-api.com/graphql'
    : 'https://payments.sandbox.braintree-api.com/graphql';
}

function keys(ctx: AdapterContext): { publicKey: string; privateKey: string } {
  const publicKey = ctx.credentials.publicKey ?? '';
  const privateKey = ctx.credentials.privateKey ?? '';
  if (publicKey === '' || privateKey === '')
    throw new ValidationError('The Braintree public key or private key is missing.');
  return { publicKey, privateKey };
}

export interface GraphqlError {
  message: string;
  errorClass: string | null;
  legacyCode: string | null;
}

export interface GraphqlResult {
  data: Json | null;
  errors: GraphqlError[];
}

function readErrors(body: Json | null): GraphqlError[] {
  return list(body?.errors).map((e) => {
    const ext = obj(e.extensions);
    return {
      message: str(e.message) ?? '',
      errorClass: str(ext?.errorClass),
      legacyCode: str(ext?.legacyCode),
    };
  });
}

/** Sends one GraphQL document. Bad keys throw a ValidationError; an unreachable service throws a plain Error. */
export async function graphql(
  ctx: AdapterContext,
  query: string,
  variables: Json | null,
): Promise<GraphqlResult> {
  const { publicKey, privateKey } = keys(ctx);
  const response = await sendHttp({
    method: 'POST',
    url: endpoint(ctx.environment),
    headers: {
      authorization: basicAuth(publicKey, privateKey),
      'braintree-version': BRAINTREE_VERSION,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(variables ? { query, variables } : { query }),
    // The guides recommend 60 seconds because creating a transaction talks to the card processor.
    timeoutMs: 60_000,
  });
  if (response.status === 401 || response.status === 403) {
    throw new ValidationError('Braintree did not accept the API keys for this environment.');
  }
  if (response.status >= 500 || response.status === 429) {
    throw new Error(`braintree unavailable (${response.status})`);
  }
  const body = parseJson(response.text);
  if (body === null) throw new Error(`braintree answered without JSON (${response.status})`);
  const errors = readErrors(body);
  const first = errors[0];
  if (first && (first.errorClass === 'AUTHENTICATION' || first.errorClass === 'AUTHORIZATION')) {
    throw new ValidationError('Braintree did not accept the API keys for this environment.');
  }
  return { data: obj(body.data), errors };
}

/** True for failures that may succeed on a retry with the same request key. */
export function isTransient(errors: readonly GraphqlError[]): boolean {
  return errors.some(
    (e) =>
      e.errorClass === 'INTERNAL' ||
      e.errorClass === 'SERVICE_AVAILABILITY' ||
      e.errorClass === 'RESOURCE_LIMIT',
  );
}
