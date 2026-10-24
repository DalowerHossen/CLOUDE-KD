// path: lib/project/input.ts
// Input of the project and time screens. Safe to import in the browser. Money and hours are text, never JavaScript numbers.
import { z } from 'zod';
import { moneyNonNegative, moneyText, plain } from '@/lib/crm/clients';
import { Money } from '@/lib/utils/currency';

const uuid = z.string().uuid();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Enter a date.' });

/** Hours with at most two decimals, above zero and at most 24 (one day). */
export const hoursText = z
  .string()
  .trim()
  .regex(/^\d{1,2}(\.\d{1,2})?$/, { message: 'Enter hours such as 1.5 or 0.25.' })
  .refine((v) => Money.parse(v).isPositive() && Money.parse(v).lte('24'), {
    message: 'Hours must be above 0 and at most 24.',
  });

const positiveHours = z
  .string()
  .trim()
  .regex(/^\d{1,5}(\.\d{1,2})?$/, { message: 'Enter hours such as 120 or 40.5.' })
  .refine((v) => Money.parse(v).isPositive(), { message: 'Enter an amount above zero.' });
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

export const PROJECT_STATUSES = ['planned', 'active', 'on_hold', 'completed', 'cancelled'] as const;
export const BILLING_TYPES = ['hourly', 'fixed', 'retainer', 'non_billable'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type BillingType = (typeof BILLING_TYPES)[number];

export const projectInputSchema = z
  .object({
    name: plain(1, 150),
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$|^$/, {
        message: 'Use letters, digits and . _ - only (20 at most).',
      }),
    description: plain(0, 5000),
    clientId: uuid.nullable(),
    status: z.enum(PROJECT_STATUSES),
    billingType: z.enum(BILLING_TYPES),
    defaultRate: moneyNonNegative.nullable(),
    fixedFee: moneyNonNegative.nullable(),
    retainerHours: positiveHours.nullable(),
    budgetHours: positiveHours.nullable(),
    budgetAmount: positiveMoney.nullable(),
    startDate: day.nullable(),
    endDate: day.nullable(),
  })
  .strict()
  .refine((v) => v.startDate === null || v.endDate === null || v.endDate >= v.startDate, {
    message: 'The end date cannot be before the start date.',
    path: ['endDate'],
  })
  .refine(
    (v) =>
      v.billingType !== 'fixed' || (v.fixedFee !== null && Money.parse(v.fixedFee).isPositive()),
    {
      message: 'Enter the fixed fee of the project.',
      path: ['fixedFee'],
    },
  )
  .refine((v) => v.billingType !== 'retainer' || v.retainerHours !== null, {
    message: 'Enter the hours the retainer covers.',
    path: ['retainerHours'],
  })
  .refine((v) => v.billingType === 'non_billable' || v.clientId !== null, {
    message: 'Choose the client to bill.',
    path: ['clientId'],
  });
export type ProjectInput = z.infer<typeof projectInputSchema>;

export const projectUpdateSchema = z
  .object({ expectedVersion: z.number().int().min(1), project: projectInputSchema })
  .strict();

export const memberInputSchema = z
  .object({
    userId: uuid,
    role: z.enum(['manager', 'member']),
    rate: moneyNonNegative.nullable(),
  })
  .strict();

export const milestoneInputSchema = z
  .object({
    name: plain(1, 150),
    dueDate: day.nullable(),
    amount: moneyNonNegative.nullable(),
    status: z.enum(['open', 'done']),
  })
  .strict();

export const timeEntryInputSchema = z
  .object({
    projectId: uuid,
    workDate: day,
    hours: hoursText,
    description: plain(0, 1000),
    billable: z.boolean(),
    milestoneId: uuid.nullable(),
  })
  .strict();
export type TimeEntryInput = z.infer<typeof timeEntryInputSchema>;

export const timeEntryUpdateSchema = z
  .object({ expectedVersion: z.number().int().min(1), entry: timeEntryInputSchema })
  .strict();

export const timerStartSchema = z
  .object({ projectId: uuid, description: plain(0, 1000), billable: z.boolean() })
  .strict();

export const timeIdsSchema = z.object({ ids: z.array(uuid).min(1).max(200) }).strict();

export const timeDecisionSchema = z
  .object({
    ids: z.array(uuid).min(1).max(200),
    action: z.enum(['approve', 'reject']),
    reason: plain(0, 300),
  })
  .strict()
  .refine((v) => v.action !== 'reject' || v.reason.trim().length >= 3, {
    message: 'Give a reason for rejecting.',
    path: ['reason'],
  });

export const timeSettingsSchema = z
  .object({
    requireApproval: z.boolean(),
    roundMinutes: z.union([
      z.literal(0),
      z.literal(5),
      z.literal(6),
      z.literal(10),
      z.literal(15),
      z.literal(30),
      z.literal(60),
    ]),
    lockThrough: day.nullable(),
    expectedVersion: z.number().int().min(0),
  })
  .strict();

export const BILL_GROUPINGS = ['entry', 'day', 'person', 'single'] as const;
export type BillGrouping = (typeof BILL_GROUPINGS)[number];

/** Which approved time, milestones and expenses go on the invoice, and how the hours are shown. */
export const billInputSchema = z
  .object({
    entryIds: z.array(uuid).max(5000),
    milestoneIds: z.array(uuid).max(100),
    expenseIds: z.array(uuid).max(500),
    grouping: z.enum(BILL_GROUPINGS),
    /** Bills every hour at this rate instead of the rate each entry carries. */
    rateOverride: moneyNonNegative.nullable(),
    /** For a retainer project: the period the hours belong to. */
    retainerFrom: day.nullable(),
    retainerTo: day.nullable(),
  })
  .strict()
  .refine((v) => v.entryIds.length + v.milestoneIds.length + v.expenseIds.length > 0, {
    message: 'Choose what to bill.',
    path: ['entryIds'],
  })
  .refine((v) => (v.retainerFrom === null) === (v.retainerTo === null), {
    message: 'Enter both dates of the retainer period.',
    path: ['retainerTo'],
  })
  .refine(
    (v) => v.retainerFrom === null || v.retainerTo === null || v.retainerTo >= v.retainerFrom,
    {
      message: 'The period cannot end before it starts.',
      path: ['retainerTo'],
    },
  );
export type BillInput = z.infer<typeof billInputSchema>;
