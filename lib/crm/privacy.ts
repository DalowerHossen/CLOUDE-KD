// path: lib/crm/privacy.ts
// Input of the data screens of a client: privacy requests, bulk changes, statement e-mail. Safe in the browser.
import { z } from 'zod';
import { plain } from './clients';

const uuid = z.string().uuid();

export const privacyRequestSchema = z
  .object({
    clientId: uuid,
    kind: z.enum(['anonymize', 'delete']),
    reason: plain(10, 1000),
  })
  .strict();
export type PrivacyRequestInput = z.infer<typeof privacyRequestSchema>;

export const MAX_BULK = 200;

const ids = z
  .array(uuid)
  .min(1)
  .max(MAX_BULK)
  .transform((v) => [...new Set(v)]);

export const bulkSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('archive'), ids }).strict(),
  z.object({ action: z.literal('reactivate'), ids }).strict(),
  z.object({ action: z.literal('delete'), ids }).strict(),
  z
    .object({
      action: z.literal('add_tag'),
      ids,
      value: plain(1, 30).transform((v) => v.toLowerCase()),
    })
    .strict(),
  z
    .object({
      action: z.literal('remove_tag'),
      ids,
      value: plain(1, 30).transform((v) => v.toLowerCase()),
    })
    .strict(),
  z
    .object({ action: z.literal('set_risk'), ids, value: z.enum(['none', 'watch', 'high']) })
    .strict(),
  z
    .object({
      action: z.literal('set_terms'),
      ids,
      value: z.number().int().min(0).max(365).nullable(),
    })
    .strict(),
]);
export type BulkInput = z.infer<typeof bulkSchema>;

export const statementMailSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()
  .refine((v) => v.from <= v.to, { message: 'The start must not be after the end.' });
