// path: lib/estimate/input.ts
import { z } from 'zod';
import { plain } from '@/lib/crm/clients';
import { invoiceInputSchema } from '@/lib/invoice/input';

/** An estimate is written with the invoice form. Its "due date" is the date it stays valid until. */
export const estimateInputSchema = invoiceInputSchema;

export const estimateUpdateSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    autosave: z.boolean(),
    invoice: invoiceInputSchema,
  })
  .strict();

export const estimateSendSchema = z.object({ message: plain(0, 1000) }).strict();
export const estimateVoidSchema = z.object({ reason: plain(3, 300) }).strict();

/** What the client types when deciding. The address and browser come from the request, never from the body. */
export const estimateDecisionSchema = z
  .object({
    decision: z.enum(['accepted', 'declined']),
    signerName: plain(2, 200),
    note: plain(0, 1000),
    agree: z.boolean(),
  })
  .strict()
  .refine((v) => v.decision === 'declined' || v.agree, {
    message: 'Confirm that you agree before accepting.',
    path: ['agree'],
  });
export type EstimateDecision = z.infer<typeof estimateDecisionSchema>;
