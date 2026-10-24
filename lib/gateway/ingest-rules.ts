// path: lib/gateway/ingest-rules.ts
// Posting settlement entries from the main merchant's app: the key (format, header, inputs) and the batch, which names the
// sub-merchant by its reference. Pure functions; no database or network here.
import { z } from 'zod';
import { entryInput } from '@/lib/gateway/split-rules';
import { parseAllowEntry } from '@/lib/gateway/rules';
import { SETTLEMENT_MAX_BATCH } from '@/config/s16-settlement';
import { hashKey, randomBase62 } from '@/lib/integrations/api-key-rules';

export const INGEST_KEY_PREFIX = 'kd_stl_';
export const INGEST_KEY_RANDOM_LENGTH = 32;
export const INGEST_KEY_DISPLAY_LENGTH = 12;
export const INGEST_KEY_LAST_CHARS = 4;
export const INGEST_DEFAULT_RATE_PER_MINUTE = 60;
export const INGEST_MAX_RATE_PER_MINUTE = 10_000;
export const INGEST_MAX_KEYS = 10;
export const INGEST_MAX_BODY_BYTES = 262_144;

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const ingestKeyInput = z
  .object({
    name: plain(1, 80),
    rateLimitPerMinute: z
      .number()
      .int()
      .min(1)
      .max(INGEST_MAX_RATE_PER_MINUTE)
      .default(INGEST_DEFAULT_RATE_PER_MINUTE),
    allowedIps: z
      .array(
        z.string().refine((v) => parseAllowEntry(v) !== null, {
          message: 'Use an IP address or an IPv4 range like 203.0.113.0/24.',
        }),
      )
      .max(20)
      .nullable()
      .default(null),
    expiresInDays: z.number().int().min(1).max(730).nullable().default(null),
  })
  .strict();

export const ingestBatch = z
  .object({
    subMerchantReference: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._:-]{1,64}$/, 'Use the reference of the sub-merchant.'),
    entries: z.array(entryInput).min(1).max(SETTLEMENT_MAX_BATCH),
  })
  .strict();

export interface NewIngestKey {
  secret: string;
  prefix: string;
  lastChars: string;
  hash: string;
}

export async function makeIngestKey(): Promise<NewIngestKey> {
  const secret = INGEST_KEY_PREFIX + randomBase62(INGEST_KEY_RANDOM_LENGTH);
  return {
    secret,
    prefix: secret.slice(0, INGEST_KEY_DISPLAY_LENGTH),
    lastChars: secret.slice(-INGEST_KEY_LAST_CHARS),
    hash: await hashKey(secret),
  };
}

const KEY_SHAPE = new RegExp(`^${INGEST_KEY_PREFIX}[0-9A-Za-z]{${INGEST_KEY_RANDOM_LENGTH}}$`);

/** The key from an `Authorization: Bearer` header, or null when the header does not carry a key of the right shape. */
export function ingestKeyFromHeader(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(header.trim());
  const secret = match?.[1];
  return secret !== undefined && KEY_SHAPE.test(secret) ? secret : null;
}
