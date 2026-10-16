// path: lib/security/ssrf.ts
// SSRF guard for every outbound request whose address a user can influence (webhook URLs, store URLs, custom domains).
// https only, no credentials, fixed ports, no private or reserved addresses, and the address is checked again at
// connect time so a DNS answer that changes between check and use (DNS rebinding) cannot reach the inside network.
import { request } from 'node:https';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import { SSRF_ALLOWED_PORTS, SSRF_MAX_RESPONSE_BYTES, SSRF_TIMEOUT_MS } from '@/config/security';
import { isNonPublicIp } from './ip';

export class SsrfError extends Error {
  constructor(public readonly reason: string) {
    super(`Outbound request refused: ${reason}`);
    this.name = 'SsrfError';
  }
}

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.corp',
  '.localdomain',
];

/** Static checks that need no network. Returns the parsed URL or throws SsrfError. */
export function validateOutboundUrl(raw: string): URL {
  if (raw.length > 2048) throw new SsrfError('url too long');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError('invalid url');
  }
  if (url.protocol !== 'https:') throw new SsrfError('only https is allowed');
  if (url.username !== '' || url.password !== '') throw new SsrfError('credentials in url');
  const port = url.port === '' ? 443 : Number(url.port);
  if (!SSRF_ALLOWED_PORTS.includes(port)) throw new SsrfError('port not allowed');
  const host = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (host === '' || host === 'localhost') throw new SsrfError('host not allowed');
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw new SsrfError('internal host name');
  if (isIP(host) !== 0) {
    if (isNonPublicIp(host)) throw new SsrfError('private address');
  } else if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host) || /^[\d.]+$/.test(host)) {
    // Decimal, hex and shortened IPv4 spellings (for example 2130706433 or 127.1) are refused outright.
    throw new SsrfError('ambiguous address spelling');
  }
  return url;
}

function checkAddresses(addresses: readonly string[]): void {
  if (addresses.length === 0) throw new SsrfError('host does not resolve');
  for (const address of addresses)
    if (isNonPublicIp(address)) throw new SsrfError('resolves to a private address');
}

/** Resolves a host name and refuses it when any answer is non-public. */
export async function resolvePublicAddresses(host: string): Promise<string[]> {
  if (isIP(host) !== 0) {
    checkAddresses([host]);
    return [host];
  }
  const answers = await new Promise<LookupAddress[]>((resolve, reject) => {
    dnsLookup(host, { all: true, verbatim: true }, (error, result) =>
      error ? reject(error) : resolve(result),
    );
  });
  const addresses = answers.map((a) => a.address);
  checkAddresses(addresses);
  return addresses;
}

export interface SafeResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export interface SafeRequestOptions {
  method?: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  body?: string | Buffer;
  maxBytes?: number;
  timeoutMs?: number;
}

/** Performs the request. Redirects are not followed (a 3xx answer is returned as it is). */
export async function safeHttpsRequest(
  raw: string,
  options: SafeRequestOptions = {},
): Promise<SafeResponse> {
  const url = validateOutboundUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  await resolvePublicAddresses(host);
  const maxBytes = options.maxBytes ?? SSRF_MAX_RESPONSE_BYTES;
  return new Promise<SafeResponse>((resolve, reject) => {
    const req = request(
      {
        protocol: 'https:',
        hostname: host,
        port: url.port === '' ? 443 : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: options.method ?? 'GET',
        headers: options.headers,
        timeout: options.timeoutMs ?? SSRF_TIMEOUT_MS,
        // The address is validated again here, at the moment the socket is opened.
        lookup: (hostname, _opts, callback) => {
          dnsLookup(hostname, { all: true, verbatim: true }, (error, result) => {
            if (error) return callback(error, '', 4);
            try {
              checkAddresses(result.map((a) => a.address));
            } catch (refused) {
              return callback(refused as Error, '', 4);
            }
            const first = result[0];
            return callback(null, first?.address ?? '', first?.family ?? 4);
          });
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new SsrfError('response too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
        response.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new SsrfError('timeout')));
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}
