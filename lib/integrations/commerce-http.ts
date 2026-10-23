// path: lib/integrations/commerce-http.ts
// The HTTP calls to a store. The address is a store the company typed, so every call goes through the SSRF guard
// (lib/security/ssrf.ts: https only, public addresses only, no redirects). Credentials travel in headers, never in the address,
// and never in an error text or a log. The transport can be replaced (for checks).
import 'server-only';
import { COMMERCE_RESPONSE_MAX_BYTES, COMMERCE_TIMEOUT_MS } from '@/config/s16-commerce';
import { SsrfError, safeHttpsRequest } from '@/lib/security/ssrf';

export class CommerceApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    /** True when trying again later may work (a network problem, a rate limit or a server error). */
    readonly retryable: boolean,
    /** True when the credentials were refused (401 or 403): the store has to be connected again. */
    readonly authRefused: boolean = false,
  ) {
    super(message);
    this.name = 'CommerceApiError';
  }
}

export interface TransportResult {
  status: number;
  body: Buffer;
}
export type Transport = (
  url: string,
  options: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string },
) => Promise<TransportResult>;

export const defaultTransport: Transport = (url, options) =>
  safeHttpsRequest(url, {
    ...options,
    maxBytes: COMMERCE_RESPONSE_MAX_BYTES,
    timeoutMs: COMMERCE_TIMEOUT_MS,
  });

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The words a store gives for a failure (WooCommerce and WordPress: message; Shopify: errors). */
function failureText(json: unknown): string {
  const o = json !== null && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const first = text(o.message) || text(o.errors) || text(o.error) || text(o.error_description);
  return (first || 'The store refused the request.').slice(0, 300);
}

export async function callStore(
  url: string,
  options: { method: 'GET' | 'POST'; headers: Record<string, string>; json?: unknown },
  transport: Transport = defaultTransport,
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = { ...options.headers, accept: 'application/json' };
  if (options.json !== undefined) headers['content-type'] = 'application/json';
  let result: TransportResult;
  try {
    result = await transport(url, {
      method: options.method,
      headers,
      ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
    });
  } catch (error) {
    if (error instanceof SsrfError)
      throw new CommerceApiError('The store address is not allowed.', 0, false);
    throw new CommerceApiError('The store could not be reached. Try again.', 0, true);
  }
  let json: unknown = null;
  try {
    json = JSON.parse(result.body.toString('utf8'));
  } catch {
    json = null;
  }
  if (result.status < 200 || result.status >= 300) {
    const auth = result.status === 401 || result.status === 403;
    throw new CommerceApiError(
      auth ? 'The store refused the credentials.' : failureText(json),
      result.status,
      result.status >= 500 || result.status === 429,
      auth,
    );
  }
  return { status: result.status, json };
}
