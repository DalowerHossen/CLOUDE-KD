// path: lib/invoice/batch.ts
// Input of the batch routes and the words used for batch results. Safe to import in the browser.
import { z } from 'zod';
import {
  ConflictError,
  DuplicateError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { plain } from '@/lib/crm/clients';
import { floorDiv } from '@/lib/reports/numbers';
import { invoiceInputSchema } from './input';

export const BATCH_ACTIONS = ['send', 'remind', 'trash', 'void', 'tag', 'create'] as const;
export type BatchAction = (typeof BATCH_ACTIONS)[number];
export const MAX_BATCH_ITEMS = 500;
export const MAX_ATTEMPTS = 3;

const uuid = z.string().uuid();
const ids = z
  .array(uuid)
  .min(1)
  .max(MAX_BATCH_ITEMS)
  .transform((v) => [...new Set(v)]);
const runAfter = z
  .string()
  .datetime()
  .nullable()
  .refine(
    (v) =>
      v === null ||
      (Date.parse(v) > Date.now() - 60_000 && Date.parse(v) < Date.now() + 90 * 86_400_000),
    {
      message: 'Choose a time within the next 90 days.',
    },
  );

export const batchCreateSchema = z
  .discriminatedUnion('action', [
    z
      .object({
        action: z.literal('send'),
        invoiceIds: ids,
        confirmDuplicate: z.boolean(),
        message: plain(0, 1000),
        runAfter,
      })
      .strict(),
    z
      .object({ action: z.literal('remind'), invoiceIds: ids, message: plain(0, 1000), runAfter })
      .strict(),
    z.object({ action: z.literal('trash'), invoiceIds: ids, runAfter }).strict(),
    z
      .object({
        action: z.literal('void'),
        invoiceIds: ids,
        reason: plain(3, 300),
        acknowledgePayments: z.boolean(),
        runAfter,
      })
      .strict(),
    z.object({ action: z.literal('tag'), invoiceIds: ids, tag: plain(1, 30), runAfter }).strict(),
    z
      .object({
        action: z.literal('create'),
        clientIds: ids,
        /** The invoice every client gets. Client, dates and number come from the batch; the lines come from here. */
        template: invoiceInputSchema,
        autoSend: z.boolean(),
        message: plain(0, 1000),
        runAfter,
      })
      .strict(),
  ])
  .refine((v) => v.action !== 'create' || v.template.lines.length > 0, {
    message: 'The template needs at least one line.',
    path: ['template'],
  });
export type BatchCreate = z.infer<typeof batchCreateSchema>;

export const ACTION_LABEL: Record<BatchAction, string> = {
  send: 'Send invoices',
  remind: 'Send reminders',
  trash: 'Delete drafts',
  void: 'Void invoices',
  tag: 'Add a tag',
  create: 'Create invoices for clients',
};

export interface BatchCounts {
  total: number;
  done: number;
  failed: number;
  skipped: number;
}

/** Share of the batch that is finished (done, failed or skipped), as a whole percent. */
export function batchPercent(c: BatchCounts): number {
  if (c.total <= 0) return 100;
  return Math.min(100, floorDiv((c.done + c.failed + c.skipped) * 100, c.total));
}

export interface Outcome {
  status: 'done' | 'failed' | 'skipped' | 'pending';
  message: string;
  resultInvoice?: string;
}

/** What happens to an item that threw: a known problem with the data ends it; anything else is tried again. */
export function outcomeOfError(error: unknown, attempts: number): Outcome {
  const message = error instanceof Error ? error.message.slice(0, 280) : 'Something went wrong.';
  if (error instanceof DuplicateError)
    return {
      status: 'skipped',
      message: 'A similar invoice exists. Confirm duplicates to send it.',
    };
  if (
    error instanceof ValidationError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError
  )
    return { status: 'failed', message };
  return attempts >= MAX_ATTEMPTS
    ? { status: 'failed', message: `Failed after ${attempts} tries: ${message}` }
    : { status: 'pending', message: `Will try again: ${message}` };
}
