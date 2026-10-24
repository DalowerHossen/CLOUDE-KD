// path: lib/kyc/review-input.ts
// Input of the reviewer screens. Safe to import in the browser.
import { z } from 'zod';

const reason = z
  .string()
  .trim()
  .min(5)
  .max(1000)
  .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const reviewActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }).strict(),
  z
    .object({
      action: z.literal('documents'),
      documents: z
        .array(
          z
            .object({
              id: z.string().uuid(),
              status: z.enum(['accepted', 'rejected']),
              reason: z.string().trim().max(500).default(''),
            })
            .strict(),
        )
        .min(1)
        .max(4),
    })
    .strict(),
  z
    .object({
      action: z.literal('note'),
      risk: z.enum(['low', 'medium', 'high']).nullable(),
      note: z
        .string()
        .trim()
        .max(4000)
        .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' }),
    })
    .strict(),
  z
    .object({
      action: z.literal('recommend'),
      /** Needed when the automatic screening did not run or failed: the reviewer checked the names by hand. */
      screeningCheckedByHand: z.boolean().default(false),
    })
    .strict(),
  z.object({ action: z.literal('request_changes'), reason }).strict(),
  z.object({ action: z.literal('reject'), reason }).strict(),
]);
export type ReviewAction = z.infer<typeof reviewActionSchema>;
