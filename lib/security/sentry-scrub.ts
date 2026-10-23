// path: lib/security/sentry-scrub.ts
// Removes personal data and secrets from an error event before it leaves the server.
import { redact, scrubString } from '@/lib/logger/redact';

interface ScrubbableEvent {
  request?: {
    cookies?: unknown;
    headers?: Record<string, unknown>;
    data?: unknown;
    query_string?: unknown;
    url?: string;
  };
  user?: Record<string, unknown>;
  message?: string;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  breadcrumbs?: unknown[];
  exception?: { values?: { value?: string }[] };
}

const DROP_HEADERS = new Set([
  'cookie',
  'authorization',
  'x-csrf-token',
  'x-forwarded-for',
  'x-real-ip',
]);

export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  const out = { ...event };
  if (out.request) {
    const request = { ...out.request };
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([k]) => !DROP_HEADERS.has(k.toLowerCase())),
      );
    }
    if (request.url) request.url = request.url.split('?')[0] ?? request.url;
    out.request = request;
  }
  // Only the opaque user id is kept; no e-mail, name or address.
  if (out.user) out.user = typeof out.user.id === 'string' ? { id: out.user.id } : {};
  if (typeof out.message === 'string') out.message = scrubString(out.message);
  if (out.extra) out.extra = redact(out.extra) as Record<string, unknown>;
  if (out.contexts) out.contexts = redact(out.contexts) as Record<string, unknown>;
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map((b) => redact(b));
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => ({
        ...v,
        ...(typeof v.value === 'string' ? { value: scrubString(v.value) } : {}),
      })),
    };
  }
  return out;
}
