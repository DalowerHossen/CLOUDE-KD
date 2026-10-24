// path: services/reconciliation/inputs.ts
// Input shapes of the bank reconciliation services. Strict: unknown fields are refused and text has no markup.
import { z } from 'zod';
import { dayText } from '@/services/accounting/journal-rules';
import { MAX_STATEMENT_BYTES } from './statement-parsers';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const signed = z.string().regex(/^-?\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 100 or -100.50.');

export const bankAccountInput = z
  .object({
    name: plain(1, 100),
    bankName: plain(0, 100).default(''),
    last4: z
      .string()
      .regex(/^[0-9]{1,4}$/, 'Enter the last 4 digits only.')
      .nullable()
      .default(null),
    ledgerAccountId: z.string().uuid(),
    openingBalance: signed.default('0'),
    openingDate: dayText.nullable().default(null),
  })
  .strict();
export type BankAccountInput = z.infer<typeof bankAccountInput>;

export const bankAccountUpdate = z
  .object({
    version: z.number().int().min(1),
    name: plain(1, 100).optional(),
    bankName: plain(0, 100).optional(),
    status: z.enum(['active', 'closed']).optional(),
  })
  .strict();

export const importInput = z
  .object({
    bankAccountId: z.string().uuid(),
    fileName: plain(1, 200),
    text: z.string().min(1).max(MAX_STATEMENT_BYTES),
    dateFormat: z.enum(['iso', 'mdy', 'dmy']).default('iso'),
  })
  .strict();
export type ImportInput = z.infer<typeof importInput>;

export const confirmInput = z
  .object({ lineIds: z.array(z.string().uuid()).min(1).max(50) })
  .strict();

export const categorizeInput = z
  .object({ accountId: z.string().uuid(), memo: plain(0, 200).default('') })
  .strict();

export const ruleInput = z
  .object({
    name: plain(1, 100),
    bankAccountId: z.string().uuid().nullable().default(null),
    containsText: plain(2, 100),
    direction: z.enum(['any', 'in', 'out']).default('any'),
    accountId: z.string().uuid(),
    memo: plain(0, 200).default(''),
  })
  .strict();

export const startInput = z
  .object({
    bankAccountId: z.string().uuid(),
    statementDate: dayText,
    statementBalance: signed,
  })
  .strict();

export const completeInput = z.object({ note: plain(0, 500).default('') }).strict();
