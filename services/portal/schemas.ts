// path: services/portal/schemas.ts
// Request shapes of the public client portal routes. Strict: unknown fields are rejected.
import { z } from 'zod';

/** A token is "<22 URL-safe characters>.<22 URL-safe characters>" (lib/auth/tokens.ts). */
export const portalTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/, 'Invalid link.');

export const tokenOnlyBody = z.strictObject({ token: portalTokenSchema });
export const otpVerifyBody = z.strictObject({
  token: portalTokenSchema,
  code: z.string().regex(/^\d{6}$/, 'The code has six digits.'),
});

/** The payer's acceptance of the terms and the refund policy: the box must be ticked (true). */
export const consentBody = z.strictObject({ token: portalTokenSchema, accepted: z.literal(true) });
