// path: services/payroll/payroll-rules.ts
// Input shapes for payroll people, salary structures and tax settings, the pay frequency table, the employee CSV import and the
// bracket checks. Strict and sanitised: no markup, amounts as text, dates that exist. No database here.
import { z } from 'zod';
import { partialPatch } from '@/lib/security/zod-strict';
import { Money } from '@/lib/utils/currency';
import { columnOf, csvTable, toCsv } from '@/services/accounting/accounting-csv';
import { dayText } from '@/services/accounting/journal-rules';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const amount = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 1000 or 1000.50.');
const percent = z
  .string()
  .regex(
    /^(100(\.0{1,4})?|\d{1,2}(\.\d{1,4})?)$/,
    'Enter a percent from 0 to 100, like 20 or 7.5.',
  );
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9][A-Z0-9_-]{0,19}$/,
    'Use letters, numbers, dashes and underscores (20 at most).',
  );

/** Compares two amounts that may not be valid yet (the field checks report that); an invalid amount compares as not less. */
function lessThan(a: string, b: string): boolean {
  try {
    return Money.parse(a).lt(b);
  } catch {
    return false;
  }
}
function isZero(a: string): boolean {
  try {
    return Money.parse(a).isZero();
  } catch {
    return false;
  }
}

export const PAY_BASES = ['monthly', 'hourly', 'commission'] as const;
export const CONTRACTS = ['full_time', 'part_time', 'contract', 'intern'] as const;
export const STATUSES = ['active', 'on_leave', 'terminated'] as const;
export const FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const PERIODS_PER_YEAR: Record<Frequency, 12 | 24 | 26 | 52> = {
  monthly: 12,
  semimonthly: 24,
  biweekly: 26,
  weekly: 52,
};

/* ---------- employees ---------- */

/** What is stored encrypted about pay, bank and tax identity (never in plain columns). */
export const payInfo = z
  .object({ baseAmount: amount, commissionRatePercent: percent.default('0') })
  .strict();
export const bankInfo = z
  .object({
    holder: plain(1, 120),
    bankName: plain(1, 120),
    accountNumber: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9 -]{4,40}$/, 'Use 4 to 40 letters and numbers.'),
    routingCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9 -]{0,20}$/, 'Use letters and numbers.')
      .default(''),
  })
  .strict();
export const taxInfo = z
  .object({
    taxId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9 -]{4,30}$/, 'Use 4 to 30 letters and numbers.'),
    filingStatus: plain(0, 40).default(''),
    allowances: z.number().int().min(0).max(50).default(0),
  })
  .strict();
export type PayInfo = z.infer<typeof payInfo>;
export type BankInfo = z.infer<typeof bankInfo>;
export type TaxInfo = z.infer<typeof taxInfo>;

const customFields = z
  .record(z.string().regex(/^[a-z][a-z0-9_]{0,29}$/), plain(0, 200))
  .refine((v) => Object.keys(v).length <= 20, { message: 'At most 20 custom fields.' });

const employeeBase = z.object({
  firstName: plain(1, 80),
  lastName: plain(1, 80),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: plain(0, 40).default(''),
  address: plain(0, 300).default(''),
  dateOfBirth: dayText.nullable().default(null),
  department: plain(0, 80).default(''),
  jobTitle: plain(0, 80).default(''),
  joinDate: dayText,
  contractType: z.enum(CONTRACTS).default('full_time'),
  payBasis: z.enum(PAY_BASES).default('monthly'),
  gradeId: z.string().uuid().nullable().default(null),
  structureId: z.string().uuid().nullable().default(null),
  emergencyName: plain(0, 80).default(''),
  emergencyPhone: plain(0, 40).default(''),
  emergencyRelation: plain(0, 40).default(''),
  customFields: customFields.default({}),
  pay: payInfo.nullable().default(null),
  bank: bankInfo.nullable().default(null),
  tax: taxInfo.nullable().default(null),
});
export const employeeInput = employeeBase.strict();
export type EmployeeInput = z.infer<typeof employeeInput>;

export const employeeUpdate = partialPatch(employeeBase)
  .extend({
    version: z.number().int().min(1),
    status: z.enum(STATUSES).optional(),
    endDate: dayText.nullable().optional(),
  })
  .strict();

/** The columns of an employee import: no pay, bank or tax identity (those are entered one by one with the right permission). */
const NAME_FIRST = ['first name', 'firstname', 'given name'];
const NAME_LAST = ['last name', 'lastname', 'surname', 'family name'];
const EMAIL = ['email', 'e-mail'];
const PHONE = ['phone', 'mobile'];
const DEPARTMENT = ['department'];
const TITLE = ['job title', 'title', 'designation', 'position'];
const JOIN = ['join date', 'joining date', 'start date'];
const CONTRACT = ['contract type', 'contract'];
const BASIS = ['pay basis', 'salary type'];

export interface EmployeeImport {
  rows: { line: number; input: EmployeeInput }[];
  errors: { line: number; message: string }[];
}

export function parseEmployeesCsv(text: string): EmployeeImport {
  const table = csvTable(text);
  const errors: EmployeeImport['errors'] = [];
  const rows: EmployeeImport['rows'] = [];
  const idx = {
    first: columnOf(table.header, NAME_FIRST),
    last: columnOf(table.header, NAME_LAST),
    email: columnOf(table.header, EMAIL),
    phone: columnOf(table.header, PHONE),
    dept: columnOf(table.header, DEPARTMENT),
    title: columnOf(table.header, TITLE),
    join: columnOf(table.header, JOIN),
    contract: columnOf(table.header, CONTRACT),
    basis: columnOf(table.header, BASIS),
  };
  if (idx.first < 0 || idx.last < 0 || idx.email < 0 || idx.join < 0)
    return {
      rows,
      errors: [
        {
          line: 1,
          message: 'The file needs the columns: first name, last name, email and join date.',
        },
      ],
    };
  if (table.rows.length > 1000)
    return { rows, errors: [{ line: 1, message: 'A file can have 1000 rows at most.' }] };
  const seen = new Set<string>();
  table.rows.forEach((row, n) => {
    const line = n + 2;
    const cell = (c: number): string => (c >= 0 ? (row[c] ?? '').trim() : '');
    const parsed = employeeInput.safeParse({
      firstName: cell(idx.first),
      lastName: cell(idx.last),
      email: cell(idx.email),
      phone: cell(idx.phone),
      department: cell(idx.dept),
      jobTitle: cell(idx.title),
      joinDate: cell(idx.join),
      contractType:
        cell(idx.contract) === ''
          ? 'full_time'
          : cell(idx.contract)
              .toLowerCase()
              .replace(/[\s-]+/g, '_'),
      payBasis: cell(idx.basis) === '' ? 'monthly' : cell(idx.basis).toLowerCase(),
    });
    if (!parsed.success)
      return void errors.push({
        line,
        message: parsed.error.issues[0]?.message ?? 'The row is not valid.',
      });
    if (seen.has(parsed.data.email))
      return void errors.push({ line, message: 'This email is in the file twice.' });
    seen.add(parsed.data.email);
    rows.push({ line, input: parsed.data });
  });
  return { rows, errors };
}

export interface ExportRow {
  number: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  jobTitle: string;
  joinDate: string;
  contractType: string;
  payBasis: string;
  status: string;
}

export function employeesCsv(rows: readonly ExportRow[]): string {
  return toCsv(
    [
      'Employee number',
      'First name',
      'Last name',
      'Email',
      'Phone',
      'Department',
      'Job title',
      'Join date',
      'Contract type',
      'Pay basis',
      'Status',
    ],
    rows.map((r) => [
      r.number,
      r.firstName,
      r.lastName,
      r.email,
      r.phone,
      r.department,
      r.jobTitle,
      r.joinDate,
      r.contractType,
      r.payBasis,
      r.status,
    ]),
  );
}

/* ---------- salary structures ---------- */

export const gradeInput = z
  .object({ name: plain(1, 60), minAmount: amount, maxAmount: amount })
  .strict()
  .refine((v) => !lessThan(v.maxAmount, v.minAmount), {
    message: 'The top of the range cannot be below the bottom.',
    path: ['maxAmount'],
  });

export const componentInput = z
  .object({
    code,
    name: plain(1, 80),
    kind: z.enum(['earning', 'deduction']),
    calcType: z.enum(['fixed', 'percent_of_basic', 'percent_of_gross']).default('fixed'),
    defaultValue: amount.default('0'),
    taxable: z.boolean().default(true),
    preTax: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind === 'earning' && v.preTax)
      ctx.addIssue({
        code: 'custom',
        path: ['preTax'],
        message: 'Only a deduction can be taken before tax.',
      });
    if (v.kind === 'earning' && v.calcType === 'percent_of_gross')
      ctx.addIssue({
        code: 'custom',
        path: ['calcType'],
        message: 'Percent of gross is for deductions.',
      });
    if (v.calcType !== 'fixed' && !percent.safeParse(v.defaultValue).success)
      ctx.addIssue({
        code: 'custom',
        path: ['defaultValue'],
        message: 'A percent is from 0 to 100.',
      });
  });

export const structureInput = z
  .object({
    name: plain(1, 80),
    payBasis: z.enum(PAY_BASES).default('monthly'),
    gradeId: z.string().uuid().nullable().default(null),
    description: plain(0, 300).default(''),
  })
  .strict();

export const structureItemInput = z
  .object({ componentId: z.string().uuid(), value: amount })
  .strict();

export const settingsInput = z
  .object({
    version: z.number().int().min(1).optional(),
    payFrequency: z.enum(FREQUENCIES),
    overtimeMultiplier: z
      .string()
      .regex(/^[1-5](\.\d{1,4})?$/, 'Use a multiplier from 1 to 5, like 1.5.'),
    overtimeCapHours: z
      .string()
      .regex(/^\d{1,4}(\.\d{1,2})?$/)
      .nullable(),
    standardHoursPerMonth: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Use hours like 160.'),
    rounding: z.enum(['none', 'cent', 'dollar']),
  })
  .strict();

/* ---------- payroll tax rules ---------- */

export const bracketInput = z.object({ lowerAnnual: amount, rate: percent }).strict();

/** A form sends the brackets as text, "0:10; 11000:12" (lower bound, colon, rate, separated by semicolons); a list passes as it is. */
export function bracketsFromText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const [lower, rate, ...rest] = part.split(':');
      return rest.length > 0 || rate === undefined
        ? { lowerAnnual: part, rate: '' }
        : { lowerAnnual: lower?.trim() ?? '', rate: rate.trim() };
    });
}

export const taxRuleInput = z
  .object({
    code,
    name: plain(1, 80),
    kind: z.enum(['income_tax', 'employee_contribution', 'employer_contribution']),
    method: z.enum(['flat', 'bracket']),
    rate: percent.default('0'),
    appliesTo: z.enum(['taxable', 'gross']).default('taxable'),
    wageCapAnnual: amount.nullable().default(null),
    extraThresholdAnnual: amount.nullable().default(null),
    extraRate: percent.default('0'),
    exemptionAnnual: amount.default('0'),
    brackets: z.preprocess(bracketsFromText, z.array(bracketInput).max(12).default([])),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.method === 'bracket') {
      if (v.brackets.length === 0)
        ctx.addIssue({
          code: 'custom',
          path: ['brackets'],
          message: 'A bracket rule needs at least one bracket.',
        });
      const sorted = checkBrackets(v.brackets);
      if (sorted) ctx.addIssue({ code: 'custom', path: ['brackets'], message: sorted });
      if (v.wageCapAnnual !== null || v.extraThresholdAnnual !== null)
        ctx.addIssue({
          code: 'custom',
          path: ['wageCapAnnual'],
          message: 'A cap or threshold is for flat rules.',
        });
    } else if (v.brackets.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['brackets'],
        message: 'Brackets are for bracket rules.',
      });
    }
  });

/** A message when the brackets are not usable: the first starts at 0 and the lower bounds rise. */
export function checkBrackets(
  brackets: readonly { lowerAnnual: string; rate: string }[],
): string | null {
  if (brackets.length === 0) return null;
  const lowers = brackets.map((b) => b.lowerAnnual);
  if (!isZero(lowers[0] ?? '0')) return 'The first bracket must start at 0.';
  for (let k = 1; k < lowers.length; k += 1)
    if (!lessThan(lowers[k - 1] ?? '0', lowers[k] ?? '0'))
      return 'Each bracket must start above the one before.';
  return null;
}
