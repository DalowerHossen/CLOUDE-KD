// path: lib/social/http.ts
// The HTTP calls of LinkedIn, X, Telegram and Pinterest. The address is built from the documented host in config/s16-social.ts;
// the access token goes in the Authorization header (Telegram: in the address path, as its documentation shows), never in an
// error text or a log. Calls have a time limit. The fetch function can be replaced (for checks).
import 'server-only';
import { SOCIAL_TIMEOUT_MS } from '@/config/s16-social';
import { SocialApiError, defaultFetcher, type Fetcher } from './graph';

export interface HttpCall {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** Sent as JSON. */
  json?: Record<string, unknown>;
}

export interface HttpResult {
  status: number;
  headers: Headers;
  json: Record<string, unknown>;
}

const asObject = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The words a network gives for a failure: X (detail, title), LinkedIn and Pinterest (message), Telegram (description). */
export function failureText(json: Record<string, unknown>): string {
  const nested = asObject(json.error);
  const first =
    text(json.detail) ||
    text(json.message) ||
    text(json.description) ||
    text(json.title) ||
    text(nested.message);
  return (first || 'The network refused the request.').slice(0, 300);
}

export async function request(
  call: HttpCall,
  fetcher: Fetcher = defaultFetcher,
): Promise<HttpResult> {
  const headers: Record<string, string> = { ...(call.headers ?? {}) };
  let body: string | undefined;
  if (call.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(call.json);
  }
  let response: Response;
  try {
    response = await fetcher(call.url, {
      method: call.method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(SOCIAL_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new SocialApiError('The network could not be reached. Try again.', null, 0, true);
  }
  const json = asObject(await response.json().catch(() => null));
  if (!response.ok) {
    const code = typeof json.code === 'number' ? json.code : null;
    throw new SocialApiError(
      failureText(json),
      code,
      response.status,
      response.status >= 500 || response.status === 429,
    );
  }
  return { status: response.status, headers: response.headers, json };
}
