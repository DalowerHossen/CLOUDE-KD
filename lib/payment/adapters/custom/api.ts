// path: lib/payment/adapters/custom/api.ts
// Configuration reading and the guarded HTTP calls of the custom adapter (docs/processors/custom.md sections 2, 5 and
// 10). Every address is built from the saved base URL and a saved path, checked by the platform's SSRF guard, and sent
// through a client that does not follow redirects. The authentication secret never leaves this file.
import 'server-only';
import { createHash } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { toMinorUnits } from '@/lib/payment/adapters/base';
import { parseJson } from '@/lib/payment/http-client';
import { safeHttpsRequest, validateOutboundUrl } from '@/lib/security/ssrf';
import { basicAuth } from '@/lib/payment/http-client';
import type { Money } from '@/lib/utils/currency';
import type { AdapterContext } from '@/types/contracts';

export type Json = Record<string, unknown>;
export const obj = (v: unknown): Json | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;

export interface GuardedRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
}
export interface GuardedResponse {
  status: number;
  text: string;
}
export type GuardedTransport = (request: GuardedRequest) => Promise<GuardedResponse>;

const realTransport: GuardedTransport = async (request) => {
  const response = await safeHttpsRequest(request.url, {
    method: request.method,
    headers: request.headers,
    ...(request.body !== undefined ? { body: request.body } : {}),
  });
  return { status: response.status, text: response.body.toString('utf8') };
};
let transport: GuardedTransport = realTransport;

/** Used by scripts/verify only. Pass null to restore the real transport. */
export function setCustomTransportForVerification(replacement: GuardedTransport | null): void {
  transport = replacement ?? realTransport;
}

const PATH = /^\/[A-Za-z0-9._~/{}-]{0,200}$/;
const JSON_PATH = /^[A-Za-z0-9_]{1,60}(\.[A-Za-z0-9_]{1,60}){0,8}$/;
const WORDS = /^[A-Za-z0-9_. -]{1,60}(,[A-Za-z0-9_. -]{1,60}){0,19}$/;

export interface CustomConfig {
  base: URL;
  authScheme: 'none' | 'bearer' | 'basic' | 'header';
  authHeaderName: string;
  authSecret: string;
  amountFormat: 'decimal_string' | 'decimal_number' | 'minor_number';
}

function value(ctx: AdapterContext, key: string, fallback = ''): string {
  const raw = ctx.credentials[key];
  return raw === undefined || raw === '' ? fallback : raw;
}

export const setting = value;

/** A comma separated word list as a set (trimmed, lower case). */
export function words(ctx: AdapterContext, key: string, fallback: string): ReadonlySet<string> {
  const text = value(ctx, key, fallback);
  if (!WORDS.test(text)) throw new ValidationError(`The custom setting ${key} is malformed.`);
  return new Set(text.split(',').map((w) => w.trim().toLowerCase()));
}

/** A dotted response path, checked; returns the path text. */
export function pathSetting(ctx: AdapterContext, key: string, fallback: string): string {
  const text = value(ctx, key, fallback);
  if (!JSON_PATH.test(text)) throw new ValidationError(`The custom setting ${key} is malformed.`);
  return text;
}

export function config(ctx: AdapterContext): CustomConfig {
  const base = (() => {
    try {
      return validateOutboundUrl(value(ctx, 'baseUrl'));
    } catch {
      throw new ValidationError('The custom gateway base URL is not an allowed https address.');
    }
  })();
  const scheme = value(ctx, 'authScheme', 'none');
  if (scheme !== 'none' && scheme !== 'bearer' && scheme !== 'basic' && scheme !== 'header')
    throw new ValidationError('The custom authentication scheme is not supported.');
  const header = value(ctx, 'authHeaderName', 'X-API-Key');
  if (!/^[A-Za-z0-9-]{1,60}$/.test(header))
    throw new ValidationError('The custom authentication header name is malformed.');
  const secret = value(ctx, 'authSecret');
  if (scheme !== 'none' && secret === '')
    throw new ValidationError('The custom authentication secret is missing.');
  const format = value(ctx, 'amountFormat', 'decimal_string');
  if (format !== 'decimal_string' && format !== 'decimal_number' && format !== 'minor_number')
    throw new ValidationError('The custom amount format is not supported.');
  return {
    base,
    authScheme: scheme,
    authHeaderName: header,
    authSecret: secret,
    amountFormat: format,
  };
}

/** The final address of a saved path; the origin must still be the base origin. */
export function urlFor(cfg: CustomConfig, path: string, id: string | null): string {
  if (!PATH.test(path) || path.includes('..') || path.includes('//'))
    throw new ValidationError('A custom gateway path is malformed.');
  if (id === null && path.includes('{id}'))
    throw new ValidationError('A custom gateway path is malformed.');
  const filled = path.replace('{id}', id === null ? '' : encodeURIComponent(id));
  if (filled.includes('{') || filled.includes('}'))
    throw new ValidationError('A custom gateway path is malformed.');
  const prefix = cfg.base.pathname.replace(/\/$/, '');
  const url = new URL(`${cfg.base.origin}${prefix}${filled}`);
  if (url.origin !== cfg.base.origin)
    throw new ValidationError('A custom gateway path is malformed.');
  return validateOutboundUrl(url.toString()).toString();
}

function authHeaders(cfg: CustomConfig): Record<string, string> {
  if (cfg.authScheme === 'bearer') return { authorization: `Bearer ${cfg.authSecret}` };
  if (cfg.authScheme === 'basic') {
    const at = cfg.authSecret.indexOf(':');
    return { authorization: basicAuth(cfg.authSecret.slice(0, at), cfg.authSecret.slice(at + 1)) };
  }
  if (cfg.authScheme === 'header') return { [cfg.authHeaderName.toLowerCase()]: cfg.authSecret };
  return {};
}

export interface CallResult {
  status: number;
  body: Json | null;
}

export async function customCall(
  ctx: AdapterContext,
  method: 'GET' | 'POST',
  path: string,
  id: string | null,
  bodyText: string | null,
  idempotencyKey: string | null = null,
): Promise<CallResult> {
  const cfg = config(ctx);
  const response = await transport({
    method,
    url: urlFor(cfg, path, id),
    headers: {
      accept: 'application/json',
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...(idempotencyKey
        ? {
            'idempotency-key': createHash('sha256')
              .update(idempotencyKey)
              .digest('hex')
              .slice(0, 40),
          }
        : {}),
      ...authHeaders(cfg),
    },
    ...(method === 'POST' ? { body: bodyText ?? '{}' } : {}),
  });
  if (response.status >= 500 || response.status === 429)
    throw new Error(`custom gateway unavailable (${response.status})`);
  if (response.status === 401 || response.status === 403)
    throw new ValidationError('The custom gateway did not accept the credentials.');
  if (response.status >= 300 && response.status < 400)
    throw new ValidationError(
      'The custom gateway answered with a redirect, which is not followed.',
    );
  return { status: response.status, body: parseJson(response.text) };
}

/** The value at a dotted path, or undefined. */
export function at(body: unknown, path: string): unknown {
  let current: unknown = body;
  for (const part of path.split('.')) {
    if (Array.isArray(current)) current = current[/^\d+$/.test(part) ? +part : -1];
    else {
      const record = obj(current);
      current = record ? record[part] : undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

/** Text of a string or number leaf (numbers by their own text), else null. */
export function textAt(body: unknown, path: string): string | null {
  const found = at(body, path);
  if (typeof found === 'string' && found !== '') return found;
  if (typeof found === 'number' && Number.isFinite(found)) return String(found);
  return null;
}

/** The request body value of an amount for the configured format. */
export function amountValue(cfg: CustomConfig, amount: Money): { text: string; quoted: boolean } {
  const cents = toMinorUnits(amount).padStart(3, '0');
  const decimal = `${cents.slice(0, -2)}.${cents.slice(-2)}`;
  if (cfg.amountFormat === 'decimal_string') return { text: decimal, quoted: true };
  if (cfg.amountFormat === 'decimal_number') return { text: decimal, quoted: false };
  return { text: String(+toMinorUnits(amount)), quoted: false };
}

export const SAFE_ID = /^[A-Za-z0-9._~-]{1,100}$/;

const AMOUNT_MARK = '__kd_amount__';

/** JSON text of `fields` plus the amount under `amountField`, printed in the configured format. */
export function requestBody(
  cfg: CustomConfig,
  fields: Json,
  amountField: string,
  amount: Money,
): string {
  if (!/^[A-Za-z0-9_]{1,60}$/.test(amountField))
    throw new ValidationError('A custom request field name is malformed.');
  const shown = amountValue(cfg, amount);
  const text = JSON.stringify({ ...fields, [amountField]: AMOUNT_MARK });
  return text.replace(`"${AMOUNT_MARK}"`, shown.quoted ? `"${shown.text}"` : shown.text);
}
