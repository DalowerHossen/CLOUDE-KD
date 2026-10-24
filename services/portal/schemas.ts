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

/** The client's answer to an estimate. The address and browser come from the request, never from the body. */
export const decideBody = z.strictObject({
  token: portalTokenSchema,
  decision: z.enum(['accepted', 'declined']),
  signerName: z.string().trim().min(2).max(200),
  note: z.string().trim().max(1000),
  agree: z.boolean(),
});

/** "Open" on a hub row: the invoice must belong to the client of the hub link. */
export const hubOpenBody = z.strictObject({
  token: portalTokenSchema,
  invoiceId: z.string().uuid(),
});

/** The owner's answer to a client's request for a new link. A denial needs a short reason. */
export const decideRequestBody = z
  .strictObject({
    decision: z.enum(['approve', 'deny']),
    reason: z.string().trim().max(500),
  })
  .refine((v) => v.decision === 'approve' || v.reason.length >= 3, {
    message: 'Give a short reason when you deny a request.',
    path: ['reason'],
  });

/** The owner confirms the exact number of reminders in a bulk run. */
export const bulkConfirmBody = z.strictObject({ expectedCount: z.number().int().min(1).max(100) });
