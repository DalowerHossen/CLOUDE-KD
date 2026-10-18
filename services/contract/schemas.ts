// path: services/contract/schemas.ts
// Request shapes of the contract screens. Strict: unknown fields are refused. Wording is cleaned on the server.
import { z } from 'zod';
import { plain } from '@/lib/crm/clients';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date such as 2026-12-31.');
const money = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Use a number such as 1500 or 1500.50.');

export const signerSchema = z.strictObject({
  name: plain(2, 200),
  email: z.string().trim().toLowerCase().email().max(254),
  roleLabel: plain(0, 80),
});

export const contractInputSchema = z
  .strictObject({
    title: plain(2, 200),
    clientId: z.string().uuid().nullable(),
    /** A library key such as "nda", or "custom:<template id>", or null for a blank contract. */
    templateKey: z.string().max(80).nullable(),
    bodyHtml: z.string().min(1).max(200_000),
    amount: money.nullable(),
    effectiveOn: day.nullable(),
    endsOn: day.nullable(),
    signBy: day.nullable(),
    renewalNoticeDays: z.number().int().min(0).max(365),
    signingOrder: z.enum(['parallel', 'sequential']),
    /** The text that replaces {{terms}}. */
    terms: plain(0, 5000),
    signers: z.array(signerSchema).min(1).max(10),
  })
  .refine((v) => !v.effectiveOn || !v.endsOn || v.endsOn >= v.effectiveOn, {
    message: 'The end date cannot be before the start date.',
    path: ['endsOn'],
  })
  .refine((v) => new Set(v.signers.map((s) => s.email)).size === v.signers.length, {
    message: 'Each signer needs a different e-mail address.',
    path: ['signers'],
  });
export type ContractInput = z.infer<typeof contractInputSchema>;

export const contractUpdateSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  contract: contractInputSchema,
});

export const sendSchema = z.strictObject({ message: plain(0, 1000) });
export const voidSchema = z.strictObject({ reason: plain(3, 500) });

export const templateInputSchema = z.strictObject({
  name: plain(2, 120),
  bodyHtml: z.string().min(1).max(200_000),
});
export type TemplateInput = z.infer<typeof templateInputSchema>;

export const listQuerySchema = z.strictObject({
  status: z
    .enum(['draft', 'sent', 'viewed', 'partly_signed', 'signed', 'declined', 'void', 'expired'])
    .optional(),
  clientId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
