// path: lib/security/zod-strict.ts
// Zod building blocks that refuse control characters and unknown fields.
import { z } from 'zod';
import { cleanString } from './sanitizer';

/** Plain text without control characters, normalized and trimmed. */
export const safeText = (max: number, min = 0): z.ZodType<string, z.ZodTypeDef, string> =>
  z
    .string()
    .max(max * 4)
    .transform((v) => cleanString(v).trim())
    .pipe(z.string().min(min).max(max));

/** Identifier used in URLs: lower case letters, digits, dash and underscore. */
export const safeSlug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);

/** Strict object: unknown keys are an error (mass assignment guard). */
export function strict<T extends z.ZodRawShape>(shape: T): z.ZodObject<T, 'strict'> {
  return z.object(shape).strict();
}
