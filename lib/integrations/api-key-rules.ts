// path: lib/integrations/api-key-rules.ts
// Public API keys as pure functions: the scopes, how a key is made and read, the checks on a stored key, the rate limit window
// and the usage anomaly rule. No database here.
import { z } from 'zod';
import {
  ANOMALY_FACTOR,
  ANOMALY_MIN_REQUESTS,
  API_KEY_DISPLAY_LENGTH,
  API_KEY_LAST_CHARS,
  API_KEY_LIVE_PREFIX,
  API_KEY_RANDOM_LENGTH,
  API_KEY_TEST_PREFIX,
  API_RESOURCES,
  DEFAULT_RATE_LIMIT_PER_MINUTE,
  DEFAULT_ROTATION_OVERLAP_HOURS,
  MAX_KEY_LIFETIME_DAYS,
  MAX_RATE_LIMIT_PER_MINUTE,
  MAX_ROTATION_OVERLAP_HOURS,
  MIN_RATE_LIMIT_PER_MINUTE,
  WRITABLE_RESOURCES,
  type ApiResource,
} from '@/config/s16-api';
import { sha256Hex } from '@/lib/utils/hash';

export type KeyMode = 'live' | 'sandbox';

/** Every scope a key can carry: `read:<resource>` and, for writable resources, `write:<resource>`. */
export const ALL_SCOPES: readonly string[] = [
  ...API_RESOURCES.map((r) => `read:${r}`),
  ...WRITABLE_RESOURCES.map((r) => `write:${r}`),
];

export function isScope(value: string): boolean {
  return ALL_SCOPES.includes(value);
}

/** A write scope also allows reading the same resource. */
export function scopeAllows(scopes: readonly string[], needed: string): boolean {
  if (scopes.includes(needed)) return true;
  const [verb, resource] = needed.split(':');
  return verb === 'read' && resource !== undefined && scopes.includes(`write:${resource}`);
}

export function scopeFor(method: string, resource: ApiResource): string {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
    ? `read:${resource}`
    : `write:${resource}`;
}

const plain = (min: number, max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

const scopeList = z
  .array(z.string().refine(isScope, { message: 'Unknown scope.' }))
  .min(1)
  .max(ALL_SCOPES.length)
  .refine((v) => new Set(v).size === v.length, { message: 'A scope is listed twice.' });

export const keyInput = z
  .object({
    name: plain(1, 80),
    mode: z.enum(['live', 'sandbox']).default('live'),
    scopes: scopeList,
    rateLimitPerMinute: z
      .number()
      .int()
      .min(MIN_RATE_LIMIT_PER_MINUTE)
      .max(MAX_RATE_LIMIT_PER_MINUTE)
      .default(DEFAULT_RATE_LIMIT_PER_MINUTE),
    expiresInDays: z.number().int().min(1).max(MAX_KEY_LIFETIME_DAYS).nullable().default(null),
  })
  .strict();

export const keyUpdate = z
  .object({
    version: z.number().int().min(1),
    name: plain(1, 80).optional(),
    scopes: scopeList.optional(),
    rateLimitPerMinute: z
      .number()
      .int()
      .min(MIN_RATE_LIMIT_PER_MINUTE)
      .max(MAX_RATE_LIMIT_PER_MINUTE)
      .optional(),
  })
  .strict();

export const rotateInput = z
  .object({
    overlapHours: z
      .number()
      .int()
      .min(0)
      .max(MAX_ROTATION_OVERLAP_HOURS)
      .default(DEFAULT_ROTATION_OVERLAP_HOURS),
  })
  .strict();

/* ---------- making and reading a key ---------- */

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export interface NewKey {
  secret: string;
  prefix: string;
  lastChars: string;
  hash: string;
}

/** Random base62 text without modulo bias (bytes of 248 or more are skipped). */
export function randomBase62(length: number): string {
  let out = '';
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < 248 && out.length < length) out += BASE62[b % 62];
    }
  }
  return out;
}

export async function hashKey(secret: string): Promise<string> {
  return sha256Hex(secret);
}

export async function makeKey(mode: KeyMode): Promise<NewKey> {
  const secret =
    (mode === 'sandbox' ? API_KEY_TEST_PREFIX : API_KEY_LIVE_PREFIX) +
    randomBase62(API_KEY_RANDOM_LENGTH);
  return {
    secret,
    prefix: secret.slice(0, API_KEY_DISPLAY_LENGTH),
    lastChars: secret.slice(-API_KEY_LAST_CHARS),
    hash: await hashKey(secret),
  };
}

const KEY_SHAPE = new RegExp(
  `^(${API_KEY_LIVE_PREFIX}|${API_KEY_TEST_PREFIX})[0-9A-Za-z]{${API_KEY_RANDOM_LENGTH}}$`,
);

/** The key from an `Authorization: Bearer` header, or null when the header does not carry a key of the right shape. */
export function keyFromHeader(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(header.trim());
  const secret = match?.[1];
  return secret !== undefined && KEY_SHAPE.test(secret) ? secret : null;
}

export function modeOfSecret(secret: string): KeyMode {
  return secret.startsWith(API_KEY_TEST_PREFIX) ? 'sandbox' : 'live';
}

/** The text shown for a key after it was made: the beginning and the last characters. */
export function maskedKey(prefix: string, lastChars: string): string {
  return `${prefix}${'*'.repeat(8)}${lastChars}`;
}

/* ---------- state of a stored key ---------- */

export type KeyState = 'active' | 'expired' | 'revoked';

export function keyState(
  key: { expiresAt: string | null; revokedAt: string | null },
  now: Date,
): KeyState {
  if (key.revokedAt !== null) return 'revoked';
  if (key.expiresAt !== null && Date.parse(key.expiresAt) <= now.getTime()) return 'expired';
  return 'active';
}

/** When a rotated key stops working: the overlap from now, never later than its own expiry. */
export function oldKeyExpiry(
  now: Date,
  overlapHours: number,
  currentExpiry: string | null,
): string {
  const end = now.getTime() + overlapHours * 3_600_000;
  const limit = currentExpiry === null ? end : Math.min(end, Date.parse(currentExpiry));
  return new Date(limit).toISOString();
}

export function expiryFromDays(now: Date, days: number | null): string | null {
  return days === null ? null : new Date(now.getTime() + days * 86_400_000).toISOString();
}

/* ---------- rate limit ---------- */

export function windowStart(now: Date): string {
  const t = now.getTime();
  return new Date(t - (t % 60_000)).toISOString();
}

export interface RateState {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds since 1970 when the window ends. */
  reset: number;
  retryAfterSeconds: number;
}

export function rateState(hits: number, limit: number, now: Date): RateState {
  const startMs = Date.parse(windowStart(now));
  const resetMs = startMs + 60_000;
  return {
    allowed: hits <= limit,
    limit,
    remaining: Math.max(limit - hits, 0),
    reset: Math.floor(resetMs / 1000),
    retryAfterSeconds: Math.max(Math.ceil((resetMs - now.getTime()) / 1000), 1),
  };
}

export function rateHeaders(state: RateState): Record<string, string> {
  return {
    'x-ratelimit-limit': String(state.limit),
    'x-ratelimit-remaining': String(state.remaining),
    'x-ratelimit-reset': String(state.reset),
  };
}

/* ---------- usage anomaly ---------- */

/** Today is unusual when it has many requests and far more than the average of the days before it (days without requests count as 0). */
export function isUsageAnomaly(todayRequests: number, previousDays: readonly number[]): boolean {
  if (todayRequests < ANOMALY_MIN_REQUESTS || previousDays.length === 0) return false;
  const total = previousDays.reduce((s, x) => s + x, 0);
  return todayRequests * previousDays.length > ANOMALY_FACTOR * total;
}

/** Sandbox keys see the sandbox documents, live keys the live tables. */
export function dataSourceFor(mode: KeyMode): 'sandbox' | 'live' {
  return mode === 'sandbox' ? 'sandbox' : 'live';
}
