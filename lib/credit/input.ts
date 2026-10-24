// path: lib/credit/input.ts
// Input of the credit note, debit note and deposit screens. Safe to import in the browser.
import { z } from 'zod';
import { moneyNonNegative, moneyText, plain } from '@/lib/crm/clients';
import { invoiceLineSchema } from '@/lib/invoice/input';
import { Money } from '@/lib/utils/currency';

export const CREDIT_REASONS = [
  'return',
  'pricing_error',
  'goodwill',
  'cancellation',
  'duplicate',
  'other',
] as const;
export type CreditReason = (typeof CREDIT_REASONS)[number];

const positiveMoney = moneyText.refine(
  (v) => {
    try {
      return Money.parse(v).isPositive();
    } catch {
      return true;
    }
  },
  { message: 'Enter an amount above zero.' },
);

/** A credit note is made from a sent invoice: all of it, or chosen quantities of chosen lines. */
export const creditCreateSchema = z
  .object({
    reason: z.enum(CREDIT_REASONS),
    reasonNote: plain(0, 1000),
    returnToStock: z.boolean(),
    mode: z.enum(['full', 'lines']),
    lines: z
      .array(
        z
          .object({ position: z.number().int().min(1).max(2000), quantity: moneyNonNegative })
          .strict(),
      )
      .max(2000),
  })
  .strict()
  .refine((v) => v.mode === 'full' || v.lines.some((l) => Money.parse(l.quantity).isPositive()), {
    message: 'Choose at least one line to credit.',
    path: ['lines'],
  });
export type CreditCreate = z.infer<typeof creditCreateSchema>;

export const creditIssueSchema = z.object({ autoApply: z.boolean() }).strict();
export const creditVoidSchema = z.object({ reason: plain(3, 300) }).strict();

export const creditApplySchema = z
  .object({
    sourceType: z.enum(['credit_note', 'deposit']),
    sourceId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    amount: positiveMoney,
  })
  .strict();
export type CreditApply = z.infer<typeof creditApplySchema>;

/** A deposit asks for part of an invoice up front: a percentage of every line, or one fixed amount. */
export const depositCreateSchema = z
  .object({
    mode: z.enum(['percent', 'amount']),
    value: positiveMoney,
    description: plain(0, 200),
  })
  .strict()
  .refine((v) => v.mode !== 'percent' || Money.parse(v.value).lte('100'), {
    message: 'A percentage cannot be above 100.',
    path: ['value'],
  });
export type DepositCreate = z.infer<typeof depositCreateSchema>;

/** A debit note charges more for an invoice that was already sent (extra work, a price correction). */
export const debitNoteSchema = z
  .object({
    reason: plain(3, 500),
    lines: z.array(invoiceLineSchema).min(1).max(200),
  })
  .strict();
export type DebitNoteCreate = z.infer<typeof debitNoteSchema>;
