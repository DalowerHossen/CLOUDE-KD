// path: schemas/payment/review.ts
import { z } from 'zod';

export const reviewDecisionSchema = z
  .object({
    decision: z.enum(['capture', 'void']),
    note: z.string().trim().min(3).max(300).nullable().default(null),
    blockCard: z.boolean().default(false),
  })
  .strict()
  .refine((v) => v.decision === 'capture' || v.note !== null, {
    message: 'A note is needed when a payment is voided.',
    path: ['note'],
  });
