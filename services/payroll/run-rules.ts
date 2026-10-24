// path: services/payroll/run-rules.ts
// Pay runs as pure functions: the input shapes, the check that a period fits the pay frequency, the year to date of an employee
// from earlier runs, the totals of a run, the payloads of the two domain events, the bank transfer file, and the data a payslip
// shows. No database here.
import { z } from 'zod';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { toCsv } from '@/services/accounting/accounting-csv';
import { dayText } from '@/services/accounting/journal-rules';
import type { PayLine } from './calc-rules';
import type { Frequency } from './payroll-rules';

const hours = z.string().regex(/^\d{1,4}(\.\d{1,2})?$/, 'Enter hours like 160 or 7.5.');
const amount = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 1000 or 1000.50.');
const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const runInput = z
  .object({
    periodStart: dayText,
    periodEnd: dayText,
    payDate: dayText,
    /** Empty or missing means every active employee. */
    employeeIds: z.array(z.string().uuid()).max(2000).optional(),
  })
  .strict()
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: 'The period cannot end before it starts.',
    path: ['periodEnd'],
  })
  .refine((v) => v.payDate >= v.periodEnd, {
    message: 'The pay date cannot be before the end of the period.',
    path: ['payDate'],
  });

/** What is entered for one employee in a run: hours, sales, bonus, incentive. */
export const itemInput = z
  .object({
    employeeId: z.string().uuid(),
    regularHours: hours.default('0'),
    overtimeHours: hours.default('0'),
    sales: amount.default('0'),
    bonus: amount.default('0'),
    incentive: amount.default('0'),
  })
  .strict();
export type ItemInput = z.infer<typeof itemInput>;

export const decideInput = z
  .object({ decision: z.enum(['approve', 'reject']), reason: plain(0, 500).default('') })
  .strict();

export const payInput = z.object({ paidOn: dayText, reference: plain(1, 80) }).strict();

const DAY = 86_400_000;
export const daysInPeriod = (start: string, end: string): number =>
  (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY + 1;

/** A message when the period does not fit the pay frequency (7 days, 14 days, 13 to 16 days, 28 to 31 days); null when it fits. */
export function periodProblem(frequency: Frequency, start: string, end: string): string | null {
  const d = daysInPeriod(start, end);
  const ok =
    frequency === 'weekly'
      ? d === 7
      : frequency === 'biweekly'
        ? d === 14
        : frequency === 'semimonthly'
          ? d >= 13 && d <= 16
          : d >= 28 && d <= 31;
  if (ok) return null;
  const want =
    frequency === 'weekly'
      ? '7 days'
      : frequency === 'biweekly'
        ? '14 days'
        : frequency === 'semimonthly'
          ? 'about half a month'
          : 'one month';
  return `The pay frequency is ${frequency.replace('semimonthly', 'twice a month')}: the period should be ${want}, not ${d} days.`;
}

export interface PriorItem {
  employeeId: string;
  periodEnd: string;
  gross: string;
  taxable: string;
}

/** Gross and taxable pay of an employee earlier in the same calendar year, from the items of runs already approved. */
export function ytdOf(
  prior: readonly PriorItem[],
  employeeId: string,
  periodEnd: string,
): { taxable: string; gross: string } {
  const year = periodEnd.slice(0, 4);
  const mine = prior.filter(
    (p) =>
      p.employeeId === employeeId && p.periodEnd.slice(0, 4) === year && p.periodEnd < periodEnd,
  );
  return {
    taxable: Money.sum(mine.map((p) => Money.parse(p.taxable))).toDbString(),
    gross: Money.sum(mine.map((p) => Money.parse(p.gross))).toDbString(),
  };
}

export interface ItemFigures {
  gross: string;
  taxable: string;
  employeeTaxes: string;
  deductions: string;
  net: string;
  employerContributions: string;
  employerCost: string;
}

export interface RunTotals extends ItemFigures {
  employeeCount: number;
}

export function totalsOf(items: readonly ItemFigures[]): RunTotals {
  const sum = (f: (i: ItemFigures) => string): string =>
    Money.sum(items.map((i) => Money.parse(f(i)))).toDbString();
  return {
    employeeCount: toInt(String(items.length)),
    gross: sum((i) => i.gross),
    taxable: sum((i) => i.taxable),
    employeeTaxes: sum((i) => i.employeeTaxes),
    deductions: sum((i) => i.deductions),
    net: sum((i) => i.net),
    employerContributions: sum((i) => i.employerContributions),
    employerCost: sum((i) => i.employerCost),
  };
}

/** Pre-tax plus post-tax deductions of a result, as one figure. */
export const deductionsOf = (pre: string, post: string): string =>
  Money.parse(pre).add(post).toDbString();

/** Payload of `payroll.run_approved`: what accounting needs (D4). `employerCost` here is the employer part only (contributions). */
export function approvedPayload(
  runId: string,
  periodEnd: string,
  t: RunTotals,
): Record<string, string> {
  return { runId, periodEnd, gross: t.gross, employerCost: t.employerContributions, net: t.net };
}

export function paidPayload(runId: string, net: string, paidOn: string): Record<string, string> {
  return { runId, net, paidOn };
}

export interface TransferRow {
  number: string;
  holder: string;
  bankName: string;
  accountNumber: string;
  routingCode: string;
  amount: string;
}

/** The bank transfer list: one line per employee with bank details, and the employees that cannot be paid by transfer. */
export function transferFile(
  reference: string,
  rows: readonly TransferRow[],
): { csv: string; total: string } {
  const total = Money.sum(rows.map((r) => Money.parse(r.amount))).toDbString();
  const csv = toCsv(
    [
      'Employee number',
      'Account holder',
      'Bank',
      'Account number',
      'Routing code',
      'Amount (USD)',
      'Reference',
    ],
    rows.map((r) => [
      r.number,
      r.holder,
      r.bankName,
      r.accountNumber,
      r.routingCode,
      r.amount,
      reference,
    ]),
  );
  return { csv, total };
}

export interface PayslipData {
  company: string;
  employeeName: string;
  employeeNumber: string;
  runNumber: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  lines: PayLine[];
  gross: string;
  employeeTaxes: string;
  deductions: string;
  net: string;
  employerCost: string;
  ytdGross: string;
  ytdNet: string;
}

/** Everything a payslip shows; the PDF only draws this. */
export function payslipOf(
  company: string,
  run: { runNumber: string; periodStart: string; periodEnd: string; payDate: string },
  item: { employeeName: string; employeeNumber: string; lines: PayLine[] } & ItemFigures,
  ytd: { gross: string; net: string },
): PayslipData {
  return {
    company,
    employeeName: item.employeeName,
    employeeNumber: item.employeeNumber,
    runNumber: run.runNumber,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    payDate: run.payDate,
    lines: item.lines,
    gross: item.gross,
    employeeTaxes: item.employeeTaxes,
    deductions: item.deductions,
    net: item.net,
    employerCost: item.employerCost,
    ytdGross: Money.parse(ytd.gross).add(item.gross).toDbString(),
    ytdNet: Money.parse(ytd.net).add(item.net).toDbString(),
  };
}
