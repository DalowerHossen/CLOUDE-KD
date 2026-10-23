// path: lib/integrations/webhook-transport.ts
// Sends one signed request to a company's webhook address. The host name is resolved here, every address it resolves to must be
// public (so a name that points into the platform's network is refused at connect time too), and the connection is made to the
// address that was checked, so the name cannot change between the check and the connection. Redirects are never followed, the
// answer is read only up to a small limit, and the whole call has a time limit. No secret is ever put in an error text.
import 'server-only';
import { lookup as dnsLookup } from 'node:dns/promises';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { WEBHOOK_RESPONSE_CLIP, WEBHOOK_TIMEOUT_MS } from '@/config/s16-api';
import { isPublicIp } from './ssrf';

export interface TransportRequest {
  url: URL;
  headers: Record<string, string>;
  body: string;
}

export interface TransportResult {
  statusCode: number | null;
  /** The beginning of the answer (at most the clip size). */
  body: string;
  error: string | null;
  durationMs: number;
}

export type Transport = (request: TransportRequest) => Promise<TransportResult>;
export type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;

const systemResolver: Resolver = async (host) => dnsLookup(host, { all: true, verbatim: true });

export type Resolved = { ok: true; address: string; family: 4 | 6 } | { ok: false; error: string };

/** The address to connect to, or why the host is refused. Every resolved address must be public. */
export async function resolvePublicAddress(
  host: string,
  resolver: Resolver = systemResolver,
): Promise<Resolved> {
  let found: { address: string; family: number }[];
  try {
    found = await resolver(host);
  } catch {
    return { ok: false, error: 'The host name could not be resolved.' };
  }
  if (found.length === 0) return { ok: false, error: 'The host name could not be resolved.' };
  if (found.some((a) => !isPublicIp(a.address)))
    return { ok: false, error: 'The host name points to an address that is not allowed.' };
  const first = found[0];
  if (!first) return { ok: false, error: 'The host name could not be resolved.' };
  return { ok: true, address: first.address, family: first.family === 6 ? 6 : 4 };
}

function describe(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';
  if (code === 'ECONNREFUSED') return 'The connection was refused.';
  if (code === 'ECONNRESET') return 'The connection was reset.';
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return 'The connection timed out.';
  if (
    code.startsWith('ERR_TLS') ||
    code.startsWith('CERT_') ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'ERR_SSL_WRONG_VERSION_NUMBER'
  )
    return 'The security certificate of the address is not valid.';
  if (code === 'ENOTFOUND') return 'The host name was not found.';
  return 'The request could not be sent.';
}

export function makeHttpsTransport(resolver: Resolver = systemResolver): Transport {
  return async (request) => {
    const started = Date.now();
    const elapsed = (): number => Date.now() - started;
    const host = request.url.hostname.replace(/\.$/, '');
    const resolved = await resolvePublicAddress(host, resolver);
    if (!resolved.ok)
      return { statusCode: null, body: '', error: resolved.error, durationMs: elapsed() };
    const pinned: LookupFunction = (_hostname, options, callback) => {
      if ((options as { all?: boolean }).all === true)
        (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [
          { address: resolved.address, family: resolved.family },
        ]);
      else callback(null, resolved.address, resolved.family);
    };
    return new Promise<TransportResult>((resolve) => {
      let settled = false;
      const done = (result: Omit<TransportResult, 'durationMs'>): void => {
        if (settled) return;
        settled = true;
        resolve({ ...result, durationMs: elapsed() });
      };
      const req = https.request(
        {
          host,
          port: request.url.port === '' ? 443 : Number.parseInt(request.url.port, 10),
          path: `${request.url.pathname}${request.url.search}`,
          method: 'POST',
          headers: {
            ...request.headers,
            host: request.url.host,
            'content-length': String(Buffer.byteLength(request.body)),
          },
          lookup: pinned,
          servername: host,
          timeout: WEBHOOK_TIMEOUT_MS,
        },
        (response) => {
          let text = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => {
            text += chunk;
            if (text.length > WEBHOOK_RESPONSE_CLIP) {
              text = text.slice(0, WEBHOOK_RESPONSE_CLIP);
              response.destroy();
            }
          });
          const finish = (): void =>
            done({ statusCode: response.statusCode ?? null, body: text, error: null });
          response.on('end', finish);
          response.on('close', finish);
          response.on('error', finish);
        },
      );
      req.on('timeout', () => {
        done({ statusCode: null, body: '', error: 'The receiver did not answer in time.' });
        req.destroy();
      });
      req.on('error', (error) => done({ statusCode: null, body: '', error: describe(error) }));
      req.end(request.body);
    });
  };
}

export const httpsTransport: Transport = makeHttpsTransport();
