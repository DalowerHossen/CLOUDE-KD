// path: lib/payment/http-client.ts
// The one HTTP client the processor adapters use. Fixed https endpoints only, a timeout, a response size cap, and no
// logging of bodies or headers (they can carry secrets). Verification scripts replace the transport with a local fake.
import 'server-only';

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Absolute https URL built by the adapter from its fixed base address. */
  url: string;
  headers: Readonly<Record<string, string>>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  text: string;
  headers: Readonly<Record<string, string>>;
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 2_000_000;

const fetchTransport: HttpTransport = async (request) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
    });
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error('response too large');
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return { status: response.status, text, headers };
  } finally {
    clearTimeout(timer);
  }
};

let transport: HttpTransport = fetchTransport;

/** Used by scripts/verify only. Pass null to restore the real transport. */
export function setTransportForVerification(replacement: HttpTransport | null): void {
  transport = replacement ?? fetchTransport;
}

export async function sendHttp(request: HttpRequest): Promise<HttpResponse> {
  if (!request.url.startsWith('https://')) throw new Error('only https addresses are allowed');
  return transport(request);
}

/** Parses a JSON response body; returns null for an empty or invalid body. */
export function parseJson(text: string): Record<string, unknown> | null {
  if (text.trim() === '') return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function basicAuth(user: string, password = ''): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}
