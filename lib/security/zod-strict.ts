// path: lib/security/zod-strict.ts
// Zod building blocks that refuse control characters and unknown fields.
import { z } from 'zod';
import { cleanString } from './sanitizer';

/** Plain text without control characters, normalized and trimmed. */
export const safeText = (max: number, min = 0): z.ZodType<string, string> =>
  z
    .string()
    .max(max * 4)
    .transform((v) => cleanString(v).trim())
    .pipe(z.string().min(min).max(max));

/** Identifier used in URLs: lower case letters, digits, dash and underscore. */
export const safeSlug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);

/** True when the schema is an object that rejects unknown keys (made with .strict() or z.strictObject). */
export function isStrictObject(schema: z.ZodTypeAny | undefined): boolean {
  return schema instanceof z.ZodObject && schema.def.catchall instanceof z.ZodNever;
}

type WithoutDefault<F> = F extends z.ZodDefault<infer Inner> ? Inner : F;

/**
 * The fields of an update (PATCH) body: every field optional and without its default. Zod 3 left a missing field of a partial
 * object undefined; Zod 4 would fill the default of the create form, which would overwrite stored values on a partial update.
 */
export function partialPatch<S extends z.ZodRawShape>(
  schema: z.ZodObject<S>,
): z.ZodObject<{ [K in keyof S]: z.ZodOptional<WithoutDefault<S[K]>> }> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(
    schema.shape as unknown as Record<string, z.ZodTypeAny>,
  ))
    shape[key] = (
      field instanceof z.ZodDefault ? (field.removeDefault() as z.ZodTypeAny) : field
    ).optional();
  return z.object(shape) as unknown as z.ZodObject<{
    [K in keyof S]: z.ZodOptional<WithoutDefault<S[K]>>;
  }>;
}

/** Strict object: unknown keys are an error (mass assignment guard). */
export function strict<T extends z.ZodRawShape>(shape: T): z.ZodObject<T, z.core.$strict> {
  return z.object(shape).strict();
}
