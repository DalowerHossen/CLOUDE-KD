// path: lib/schedule/input.ts
// Input of the recurring invoice and installment routes. Safe to import in the browser.
import { z } from 'zod';
import { moneyText, plain } from '@/lib/crm/clients';
import { invoiceInputSchema } from '@/lib/invoice/input';
import { Money } from '@/lib/utils/currency';
import { MAX_EVERY, RECURRENCE_UNITS } from './recurrence';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Enter a date.' });

export const recurringInputSchema = z
  .object({
    name: plain(1, 100),
    /** The invoice every run copies. Its dates are ignored: each run uses the run date and the payment terms. */
    template: invoiceInputSchema,
    unit: z.enum(RECURRENCE_UNITS),
    every: z.number().int().min(1).max(365),
    monthEnd: z.boolean(),
    startDate: day,
    endDate: day.nullable(),
    maxOccurrences: z.number().int().min(1).max(1000).nullable(),
    autoSend: z.boolean(),
    sendMessage: plain(0, 1000),
  })
  .strict()
  .refine((v) => v.template.clientId !== null, {
    message: 'Choose a client for a recurring invoice.',
    path: ['template'],
  })
  .refine((v) => v.every <= MAX_EVERY[v.unit], {
    message: 'That interval is too long for this unit.',
    path: ['every'],
  })
  .refine((v) => v.endDate === null || v.endDate >= v.startDate, {
    message: 'The end date cannot be before the start date.',
    path: ['endDate'],
  });
export type RecurringInput = z.infer<typeof recurringInputSchema>;

export const recurringUpdateSchema = z
  .object({ expectedVersion: z.number().int().min(1), schedule: recurringInputSchema })
  .strict();

export const recurringActionSchema = z
  .object({ action: z.enum(['pause', 'resume', 'end', 'run_now']) })
  .strict();

export const recurringPreviewSchema = z
  .object({
    unit: z.enum(RECURRENCE_UNITS),
    every: z.number().int().min(1).max(365),
    monthEnd: z.boolean(),
    startDate: day,
    from: z.number().int().min(0).max(1000),
  })
  .strict()
  .refine((v) => v.every <= MAX_EVERY[v.unit], {
    message: 'That interval is too long.',
    path: ['every'],
  });

const installmentRow = z
  .object({
    dueDate: day,
    amount: moneyText.refine(
      (v) => {
        try {
          return Money.parse(v).isPositive();
        } catch {
          return true;
        }
      },
      { message: 'Enter an amount above zero.' },
    ),
  })
  .strict();

export const installmentPlanSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('even'),
      count: z.number().int().min(2).max(60),
      firstDue: day,
      unit: z.enum(['week', 'month']),
      every: z.number().int().min(1).max(12),
      downPaymentPercent: moneyText.refine(
        (v) => {
          try {
            const m = Money.parse(v);
            return !m.isNegative() && m.lt('100');
          } catch {
            return true;
          }
        },
        { message: 'The down payment must be below 100 percent.' },
      ),
    })
    .strict(),
  z.object({ mode: z.literal('custom'), rows: z.array(installmentRow).min(2).max(60) }).strict(),
]);
export type InstallmentPlanInput = z.infer<typeof installmentPlanSchema>;

export const reminderSettingsSchema = z
  .object({
    enabled: z.boolean(),
    steps: z.array(z.number().int().min(-30).max(365)).max(12),
    quietStart: z.number().int().min(0).max(23),
    quietEnd: z.number().int().min(0).max(23),
    businessDaysOnly: z.boolean(),
    ccOwner: z.boolean(),
    message: plain(0, 1000),
  })
  .strict();
export type ReminderSettingsInput = z.infer<typeof reminderSettingsSchema>;

export const lateFeeSettingsSchema = z
  .object({
    enabled: z.boolean(),
    kind: z.enum(['percent', 'fixed']),
    value: moneyText,
    repeat: z.enum(['once', 'monthly']),
    graceDays: z.number().int().min(0).max(365),
    capPercent: moneyText.nullable(),
    capAmount: moneyText.nullable(),
    autoApply: z.boolean(),
    label: plain(1, 100),
  })
  .strict()
  .refine((v) => !Money.parse(v.value).isNegative(), {
    message: 'Enter an amount of zero or more.',
    path: ['value'],
  })
  .refine((v) => v.kind !== 'percent' || Money.parse(v.value).lte('100'), {
    message: 'A percentage cannot be above 100.',
    path: ['value'],
  })
  .refine(
    (v) =>
      v.capPercent === null ||
      (Money.parse(v.capPercent).isPositive() && Money.parse(v.capPercent).lte('100')),
    {
      message: 'The cap share must be above 0 and at most 100 percent.',
      path: ['capPercent'],
    },
  )
  .refine((v) => v.capAmount === null || Money.parse(v.capAmount).isPositive(), {
    message: 'The cap amount must be above zero.',
    path: ['capAmount'],
  });
export type LateFeeSettingsInput = z.infer<typeof lateFeeSettingsSchema>;

export const feeDecisionSchema = z
  .object({ action: z.enum(['apply', 'waive']), reason: plain(0, 300) })
  .strict()
  .refine((v) => v.action !== 'waive' || v.reason.trim().length >= 3, {
    message: 'Give a reason for waiving the fee.',
    path: ['reason'],
  });

export const holdSchema = z
  .object({
    kind: z.enum(['promise', 'pause']),
    untilDate: day.nullable(),
    note: plain(0, 300),
  })
  .strict()
  .refine((v) => v.kind !== 'promise' || v.untilDate !== null, {
    message: 'Enter the date the client promised to pay.',
    path: ['untilDate'],
  });

export const writeOffSchema = z
  .object({
    amount: moneyText.refine(
      (v) => {
        try {
          return Money.parse(v).isPositive();
        } catch {
          return true;
        }
      },
      { message: 'Enter an amount above zero.' },
    ),
    reason: plain(10, 500),
  })
  .strict();
