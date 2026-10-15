// path: schemas/common.ts
// Shared Zod building blocks. Object schemas must be strict so unknown fields are rejected (mass assignment guard).
import { z } from 'zod';
import { isCountryCode } from '@/config/countries';
import { Money } from '@/lib/utils/currency';

export const uuidSchema = z.string().uuid();

/** Idempotency keys: 16 to 128 URL-safe characters. */
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/, 'Invalid idempotency key.');

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const countryCodeSchema = z
  .string()
  .length(2)
  .transform((v) => v.toUpperCase())
  .refine(isCountryCode, 'Unknown country code.');

/** Postal codes: letters, digits, spaces and hyphens, 2 to 12 characters. */
export const postalCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{0,10}[A-Za-z0-9]$/, 'Invalid postal code.');

/** Money as decimal text with at most four decimal places. Parsed into the Money type. */
export const moneySchema = z.string().transform((value, ctx): Money => {
  try {
    return Money.parse(value);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid amount.' });
    return z.NEVER;
  }
});

export const paginationSchema = z
  .object({
    cursor: z.string().max(200).nullable().default(null),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const isoTimestampSchema = z.string().datetime({ offset: true });

export function strictObject<T extends z.ZodRawShape>(shape: T): z.ZodObject<T, 'strict'> {
  return z.object(shape).strict();
}
