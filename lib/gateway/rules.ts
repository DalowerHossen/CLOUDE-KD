// path: lib/gateway/rules.ts
// The sub-merchant gateway as pure functions: the inputs, path templates and their matching, the signature the main merchant's app
// checks, the headers that travel in each direction, the address allow list of a key and the mapping of the app's answer. No
// database or network here.
import { isIP } from 'node:net';
import { z } from 'zod';
import {
  GATEWAY_DEFAULT_RATE_PER_MINUTE,
  GATEWAY_KEY_DISPLAY_LENGTH,
  GATEWAY_KEY_LAST_CHARS,
  GATEWAY_KEY_PREFIX,
  GATEWAY_KEY_RANDOM_LENGTH,
  GATEWAY_MAX_ALLOWED_IPS,
  GATEWAY_MAX_KEY_LIFETIME_DAYS,
  GATEWAY_MAX_PATH_LENGTH,
  GATEWAY_MAX_PATH_SEGMENTS,
  GATEWAY_MAX_QUERY_LENGTH,
  GATEWAY_MAX_QUERY_PAIRS,
  GATEWAY_MAX_RATE_PER_MINUTE,
  GATEWAY_METHODS,
  GATEWAY_RESPONSE_TYPES,
  GATEWAY_SECRET_PREFIX,
  GATEWAY_SECRET_RANDOM_LENGTH,
} from '@/config/s16-gateway';
import { hashKey, randomBase62 } from '@/lib/integrations/api-key-rules';
import { checkWebhookUrl } from '@/lib/integrations/ssrf';
import { checkTimestamp, signPayload, verifyHmacSignature } from '@/lib/webhook';
import { sha256Hex } from '@/lib/utils/hash';
import { idempotencyKeySchema } from '@/schemas/common';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

/* ---------- path templates ---------- */

const LITERAL = /^[A-Za-z0-9._~-]{1,100}$/;
const PLACEHOLDER = /^\{([a-z][A-Za-z0-9_]{0,30})\}$/;

export type TemplateSegment = { literal: string } | { param: string };

/** The segments of a template such as `/orders/{id}`, or null when it is not valid. */
export function parseTemplate(template: string): TemplateSegment[] | null {
  if (template.length < 1 || template.length > GATEWAY_MAX_PATH_LENGTH || !template.startsWith('/'))
    return null;
  if (template === '/') return [];
  const parts = template.slice(1).split('/');
  if (parts.length > GATEWAY_MAX_PATH_SEGMENTS) return null;
  const names = new Set<string>();
  const out: TemplateSegment[] = [];
  for (const part of parts) {
    const param = PLACEHOLDER.exec(part)?.[1];
    if (param !== undefined) {
      if (names.has(param)) return null;
      names.add(param);
      out.push({ param });
    } else if (LITERAL.test(part) && part !== '.' && part !== '..') {
      out.push({ literal: part });
    } else {
      return null;
    }
  }
  return out;
}

/** The segments of a request path, or null when the path is not plain (dot segments, empty segments, encoding, odd characters). */
export function parseRequestPath(path: string): string[] | null {
  if (path.length < 1 || path.length > GATEWAY_MAX_PATH_LENGTH || !path.startsWith('/'))
    return null;
  if (path === '/') return [];
  const parts = path.slice(1).split('/');
  if (parts.length > GATEWAY_MAX_PATH_SEGMENTS) return null;
  for (const part of parts) if (!LITERAL.test(part) || part === '.' || part === '..') return null;
  return parts;
}

/** True when the request path fits the template. */
export function matchTemplate(template: string, path: string): boolean {
  const segments = parseTemplate(template);
  const parts = parseRequestPath(path);
  if (segments === null || parts === null || segments.length !== parts.length) return false;
  return segments.every((s, i) => ('literal' in s ? s.literal === parts[i] : true));
}

/** How specific a template is: more literal segments first, so `/orders/export` wins over `/orders/{id}`. */
export function specificity(template: string): number {
  return (parseTemplate(template) ?? []).filter((s) => 'literal' in s).length;
}

export interface RouteLike {
  id: string;
  method: string;
  pathTemplate: string;
  enabled: boolean;
}

/** The route for a call: same method, a template that fits, the most specific one first. */
export function findRoute<R extends RouteLike>(
  routes: readonly R[],
  method: string,
  path: string,
): R | null {
  const fitting = routes.filter(
    (r) => r.enabled && r.method === method && matchTemplate(r.pathTemplate, path),
  );
  fitting.sort((a, b) => specificity(b.pathTemplate) - specificity(a.pathTemplate));
  return fitting[0] ?? null;
}

/** The query string that is sent on: pairs are limited, control characters are refused, and it is written again in a fixed form. */
export function cleanQuery(search: string): string | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (raw.length === 0) return '';
  if (raw.length > GATEWAY_MAX_QUERY_LENGTH || /[\u0000-\u001f\u007f#]/.test(raw)) return null;
  const pairs = [...new URLSearchParams(raw).entries()];
  if (pairs.length > GATEWAY_MAX_QUERY_PAIRS) return null;
  const out = new URLSearchParams();
  for (const [k, v] of pairs) {
    if (k.length === 0 || k.length > 100 || v.length > 300) return null;
    out.append(k, v);
  }
  return out.toString();
}

/* ---------- the address of the main merchant's app ---------- */

export type UpstreamCheck = { ok: true; base: string } | { ok: false; reason: string };

/**
 * The base address of the app: https, a host name, no query, and never the platform itself. The base is kept without a trailing
 * slash. Name resolution is checked again when the connection opens.
 */
export function checkUpstreamBase(raw: string, platformHost: string | null): UpstreamCheck {
  const check = checkWebhookUrl(raw.trim());
  if (!check.ok) return check;
  const url = check.url;
  if (url.search !== '') return { ok: false, reason: 'The address must not contain a query.' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (platformHost !== null && host === platformHost.toLowerCase())
    return { ok: false, reason: 'The address must not be the address of this platform.' };
  const path = url.pathname.replace(/\/+$/, '');
  if (path.length > 100 || parseRequestPath(path === '' ? '/' : path) === null)
    return { ok: false, reason: 'The path of the address is not valid.' };
  return { ok: true, base: `${url.protocol}//${url.host}${path}` };
}

/** The full address of a call to the app. */
export function upstreamUrl(base: string, path: string, query: string): string {
  return `${base}${path === '/' ? '' : path}${query === '' ? '' : `?${query}`}`;
}

/* ---------- inputs ---------- */

const methodEnum = z.enum(GATEWAY_METHODS);
const baseUrl = z.string().trim().min(12).max(500);

export const upstreamInput = z
  .object({
    baseUrl,
    timeoutMs: z.number().int().min(1000).max(30_000).default(15_000),
  })
  .strict();

export const upstreamUpdate = z
  .object({
    baseUrl: baseUrl.optional(),
    timeoutMs: z.number().int().min(1000).max(30_000).optional(),
    enabled: z.boolean().optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine((v) => v.baseUrl !== undefined || v.timeoutMs !== undefined || v.enabled !== undefined, {
    message: 'Nothing to change.',
  });

export const routeInput = z
  .object({
    name: plain(1, 80),
    method: methodEnum,
    pathTemplate: z
      .string()
      .trim()
      .refine((v) => parseTemplate(v) !== null, {
        message: 'Use a path like /orders/{id} with letters, digits and . _ ~ - only.',
      }),
  })
  .strict();

export const routeUpdate = z
  .object({
    name: plain(1, 80).optional(),
    enabled: z.boolean().optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.enabled !== undefined, {
    message: 'Nothing to change.',
  });

const reference = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._:-]{1,64}$/, 'Use letters, digits and . _ : - only (up to 64).');
const routeIds = z.array(z.string().uuid()).max(200).nullable();

export const subMerchantInput = z
  .object({
    name: plain(1, 120),
    reference,
    contactEmail: z.string().trim().toLowerCase().email().max(254).nullable().default(null),
    routeIds: routeIds.default(null),
    note: plain(0, 500).default(''),
  })
  .strict();

export const subMerchantUpdate = z
  .object({
    name: plain(1, 120).optional(),
    contactEmail: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
    status: z.enum(['active', 'suspended', 'closed']).optional(),
    routeIds: routeIds.optional(),
    note: plain(0, 500).optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== 'version'), { message: 'Nothing to change.' });

/* ---------- the address allow list of a key ---------- */

function ipv4ToInt(text: string): number | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number.parseInt(p, 10);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out;
}

function maskInt(value: number, bits: number): number {
  const size = 2 ** (32 - bits);
  return value - (value % size);
}

/** An address or an IPv4 range such as 203.0.113.0/24. */
export function parseAllowEntry(
  entry: string,
): { kind: 'ip'; ip: string } | { kind: 'cidr'; base: number; bits: number } | null {
  const text = entry.trim();
  if (text.includes('/')) {
    const [addr, len, extra] = text.split('/');
    if (extra !== undefined || addr === undefined || len === undefined) return null;
    const v4 = ipv4ToInt(addr);
    if (v4 === null || !/^\d{1,2}$/.test(len)) return null;
    const bits = Number.parseInt(len, 10);
    if (bits < 8 || bits > 32) return null;
    return { kind: 'cidr', base: maskInt(v4, bits), bits };
  }
  return isIP(text) !== 0 ? { kind: 'ip', ip: text.toLowerCase() } : null;
}

/** True when the caller's address is allowed. An empty or missing list allows every address. */
export function ipAllowed(ip: string, list: readonly string[] | null): boolean {
  if (list === null || list.length === 0) return true;
  const v4 = ipv4ToInt(ip);
  for (const raw of list) {
    const entry = parseAllowEntry(raw);
    if (entry === null) continue;
    if (entry.kind === 'ip' && entry.ip === ip.toLowerCase()) return true;
    if (entry.kind === 'cidr' && v4 !== null && maskInt(v4, entry.bits) === entry.base) return true;
  }
  return false;
}

export const keyInput = z
  .object({
    name: plain(1, 80),
    rateLimitPerMinute: z
      .number()
      .int()
      .min(1)
      .max(GATEWAY_MAX_RATE_PER_MINUTE)
      .default(GATEWAY_DEFAULT_RATE_PER_MINUTE),
    allowedIps: z
      .array(
        z.string().refine((v) => parseAllowEntry(v) !== null, {
          message: 'Use an IP address or an IPv4 range like 203.0.113.0/24.',
        }),
      )
      .max(GATEWAY_MAX_ALLOWED_IPS)
      .nullable()
      .default(null),
    expiresInDays: z
      .number()
      .int()
      .min(1)
      .max(GATEWAY_MAX_KEY_LIFETIME_DAYS)
      .nullable()
      .default(null),
  })
  .strict();

export const rotateSecretInput = z.object({}).strict();

/* ---------- keys and the signing secret ---------- */

export interface NewSubKey {
  secret: string;
  prefix: string;
  lastChars: string;
  hash: string;
}

export async function makeSubKey(): Promise<NewSubKey> {
  const secret = GATEWAY_KEY_PREFIX + randomBase62(GATEWAY_KEY_RANDOM_LENGTH);
  return {
    secret,
    prefix: secret.slice(0, GATEWAY_KEY_DISPLAY_LENGTH),
    lastChars: secret.slice(-GATEWAY_KEY_LAST_CHARS),
    hash: await hashKey(secret),
  };
}

const KEY_SHAPE = new RegExp(`^${GATEWAY_KEY_PREFIX}[0-9A-Za-z]{${GATEWAY_KEY_RANDOM_LENGTH}}$`);

/** The key from an `Authorization: Bearer` header, or null when the header does not carry a key of the right shape. */
export function subKeyFromHeader(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(header.trim());
  const secret = match?.[1];
  return secret !== undefined && KEY_SHAPE.test(secret) ? secret : null;
}

export function makeGatewaySecret(): string {
  return GATEWAY_SECRET_PREFIX + randomBase62(GATEWAY_SECRET_RANDOM_LENGTH);
}

/* ---------- the signature ---------- */

/** What is signed: `<t>.<METHOD>.<path and query>.<sha256 of the body>`. */
export async function signedText(
  timestampSeconds: number,
  method: string,
  pathAndQuery: string,
  body: string,
): Promise<string> {
  return `${timestampSeconds}.${method.toUpperCase()}.${pathAndQuery}.${await sha256Hex(body)}`;
}

/** The value of `X-KD-Signature`: `t=<unix seconds>,v1=<hmac>[,v1=<hmac with the previous secret>]`. */
export async function gatewaySignature(
  secrets: readonly string[],
  timestampSeconds: number,
  method: string,
  pathAndQuery: string,
  body: string,
): Promise<string> {
  const text = await signedText(timestampSeconds, method, pathAndQuery, body);
  const signatures = await Promise.all(secrets.map((s) => signPayload(s, text)));
  return [`t=${timestampSeconds}`, ...signatures.map((s) => `v1=${s}`)].join(',');
}

/** What the main merchant's app does: accept when the time is fresh and any `v1` value matches. */
export async function verifyGatewaySignature(input: {
  secret: string;
  header: string;
  method: string;
  pathAndQuery: string;
  body: string;
  now?: Date;
  toleranceSeconds?: number;
}): Promise<boolean> {
  const parts = input.header.split(',').map((p) => p.trim());
  const t = parts.find((p) => p.startsWith('t='))?.slice(2);
  if (t === undefined || !/^\d{1,12}$/.test(t)) return false;
  const stamp = Number.parseInt(t, 10);
  if (!checkTimestamp(stamp, input.now ?? new Date(), input.toleranceSeconds ?? 300).ok)
    return false;
  const text = await signedText(stamp, input.method, input.pathAndQuery, input.body);
  for (const p of parts)
    if (p.startsWith('v1=') && (await verifyHmacSignature(input.secret, text, p.slice(3))))
      return true;
  return false;
}

/* ---------- headers ---------- */

export interface UpstreamHeaderInput {
  accept: string | null;
  idempotencyKey: string | null;
  hasBody: boolean;
  timestampSeconds: number;
  signature: string;
  subMerchantReference: string;
  subMerchantId: string;
  correlationId: string;
}

/** The only headers that go to the app. The key, cookies, the caller's address and every other header stay behind. */
export function upstreamHeaders(input: UpstreamHeaderInput): Record<string, string> {
  const out: Record<string, string> = {
    accept: 'application/json',
    'user-agent': 'KD-Gateway/1',
    'x-kd-timestamp': String(input.timestampSeconds),
    'x-kd-signature': input.signature,
    'x-kd-sub-merchant': input.subMerchantReference,
    'x-kd-sub-merchant-id': input.subMerchantId,
    'x-kd-correlation-id': input.correlationId,
  };
  if (input.accept !== null && /^[A-Za-z0-9/+.*;=, -]{1,100}$/.test(input.accept))
    out.accept = input.accept;
  if (input.hasBody) out['content-type'] = 'application/json';
  if (input.idempotencyKey !== null && idempotencyKeySchema.safeParse(input.idempotencyKey).success)
    out['idempotency-key'] = input.idempotencyKey;
  return out;
}

/** The type of the app's answer when it is one of the types that are passed on, otherwise null. */
export function passableType(contentType: string | undefined): string | null {
  if (contentType === undefined) return null;
  const base = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return (GATEWAY_RESPONSE_TYPES as readonly string[]).includes(base) ? contentType : null;
}

/** The headers of the app's answer that reach the sub-merchant. */
export function responseHeadersOf(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = { 'x-content-type-options': 'nosniff' };
  const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const passable = passableType(first(headers['content-type']));
  if (passable !== null) out['content-type'] = passable;
  const retry = first(headers['retry-after']);
  if (retry !== undefined && /^\d{1,6}$/.test(retry)) out['retry-after'] = retry;
  if (first(headers['idempotent-replayed']) === 'true') out['idempotent-replayed'] = 'true';
  return out;
}

export type Outcome =
  'ok' | 'client_error' | 'upstream_error' | 'timeout' | 'blocked' | 'rate_limited' | 'not_found';

/** What the sub-merchant gets for the status of the app: 2xx and 4xx pass, everything else is a 502 of the platform. */
export function mapStatus(status: number): { pass: boolean; status: number; outcome: Outcome } {
  if (status >= 200 && status < 300) return { pass: true, status, outcome: 'ok' };
  if (status >= 400 && status < 500) return { pass: true, status, outcome: 'client_error' };
  return { pass: false, status: 502, outcome: 'upstream_error' };
}
