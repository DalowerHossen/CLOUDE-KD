// path: lib/auth/lock.ts
// Pure helpers of the lock engine: identifier normalization, keyed identifier hash and result parsing.
// The state itself lives in the database (auth_login_state); nothing here keeps state.
import { z } from 'zod';
import { hmacSha256Hex } from '@/lib/utils/hash';

/** Lower case, trimmed, NFKC. Two spellings of one address must map to one counter. */
export function normalizeIdentifier(email: string): string {
  return email.normalize('NFKC').trim().toLowerCase();
}

/** HMAC of the normalized identifier. Unknown accounts get a hash too, so they behave like known ones. */
export async function identifierHash(email: string, key: string): Promise<string> {
  return hmacSha256Hex(key, `login:${normalizeIdentifier(email)}`);
}

export const lockCheckSchema = z
  .object({
    locked: z.boolean(),
    lockedUntil: z.string().nullable(),
    failureCount: z.number().int(),
    userId: z.string().uuid().nullable(),
  })
  .strip();
export type LockCheck = z.infer<typeof lockCheckSchema>;

export const lockFailureSchema = z
  .object({
    locked: z.boolean(),
    lockedUntil: z.string().nullable(),
    failureCount: z.number().int(),
    justLocked: z.boolean(),
    lockReason: z.enum(['password', 'two_factor', 'mixed']).nullish(),
    userId: z.string().uuid().nullish(),
    companyId: z.string().uuid().nullish(),
  })
  .strip();
export type LockFailure = z.infer<typeof lockFailureSchema>;

export type FailureKind = 'password' | 'two_factor';
