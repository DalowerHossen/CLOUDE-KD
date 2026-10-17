// path: schemas/payment/processors.ts
// Strict input schemas of the processors admin API (client and server use the same file).
import { z } from 'zod';
import { PROCESSOR_IDS } from '@/types/contracts';

export const processorIdSchema = z.enum(PROCESSOR_IDS);

const expectedVersion = z.number().int().min(1).max(2_000_000_000).nullable().default(null);

export const processorActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('save_credentials'),
      /** Values by field key. The allowed keys and formats come from the adapter, checked on the server. */
      values: z.record(z.string().min(1).max(60), z.string().max(4000)),
      expectedVersion,
    })
    .strict(),
  z
    .object({
      action: z.literal('test'),
      modeId: z
        .string()
        .regex(/^[a-z0-9_]{1,40}$/)
        .optional(),
    })
    .strict(),
  z.object({ action: z.literal('enable'), expectedVersion }).strict(),
  z.object({ action: z.literal('disable'), expectedVersion }).strict(),
  z
    .object({
      action: z.literal('set_environment'),
      environment: z.enum(['sandbox', 'live']),
      expectedVersion,
    })
    .strict(),
]);
export type ProcessorAction = z.infer<typeof processorActionSchema>;
