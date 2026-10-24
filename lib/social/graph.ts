// path: lib/social/graph.ts
// The HTTP calls of the Meta networks (Facebook Pages, Instagram, Threads). The address is fixed to the documented hosts; the
// access token goes in the body or the Authorization header as the documentation shows, never in the address, and never into an
// error text or a log. Calls have a time limit. The fetch function can be replaced (for checks).
import 'server-only';
import { SOCIAL_TIMEOUT_MS } from '@/config/s16-social';
import { parseGraphError } from '@/lib/whatsapp/rules';

export class SocialApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly httpStatus: number,
    /** True when trying again later may work (a network problem, a rate limit or a server error). */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'SocialApiError';
  }
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export const defaultFetcher: Fetcher = (url, init) => fetch(url, init);

export interface GraphCall {
  base: string;
  path: string;
  method: 'GET' | 'POST' | 'DELETE';
  token: string;
  /** How the token is sent: in the form or JSON body (Facebook, Threads), or as a Bearer header (Instagram). */
  tokenIn: 'body' | 'bearer';
  /** How a POST body is written: JSON (Facebook, Instagram) or form fields (Threads). */
  encoding?: 'json' | 'form';
  params?: Record<string, string | number | boolean>;
}

export async function graph(
  call: GraphCall,
  fetcher: Fetcher = defaultFetcher,
): Promise<Record<string, unknown>> {
  const params = { ...(call.params ?? {}) };
  const headers: Record<string, string> = {};
  let url = `${call.base}/${call.path}`;
  let body: string | undefined;
  if (call.tokenIn === 'bearer') headers.authorization = `Bearer ${call.token}`;
  else params.access_token = call.token;
  if (call.method === 'GET') {
    // A read puts its fields in the address; the token then travels in a header instead.
    delete params.access_token;
    headers.authorization = `Bearer ${call.token}`;
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    if ([...q].length > 0) url += `?${q.toString()}`;
  } else if (call.encoding === 'form') {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  } else {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(params);
  }
  let response: Response;
  try {
    response = await fetcher(url, {
      method: call.method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(SOCIAL_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new SocialApiError('The network could not be reached. Try again.', null, 0, true);
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const e = parseGraphError(json);
    const retryable =
      response.status >= 500 ||
      response.status === 429 ||
      e.code === 4 ||
      e.code === 17 ||
      e.code === 32 ||
      e.code === 613;
    throw new SocialApiError(
      (e.details || e.message).slice(0, 300),
      e.code,
      response.status,
      retryable,
    );
  }
  return json !== null && typeof json === 'object' ? (json as Record<string, unknown>) : {};
}

export const idOf = (json: Record<string, unknown>): string => {
  const id = json.id;
  if (typeof id !== 'string' || id === '')
    throw new SocialApiError('The network did not return an id.', null, 200, false);
  return id;
};
