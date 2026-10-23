// path: lib/payment/bnpl-rules.ts
// The rules of buy-now-pay-later as pure functions: who may be offered installments, which terms are offered and what each
// part costs, the fee the seller pays, and what a late part means for the plan. The parts themselves are the installment
// plan of the invoice (STEP 09); this file never moves money. No database here.
import { z } from 'zod';
import {
  splitInstallments,
  type InstallmentRow,
  type InstallmentStatus,
} from '@/lib/schedule/installments';
import { Money } from '@/lib/utils/currency';
import { toInt } from '@/lib/reports/numbers';

export const BNPL_TERMS = [2, 3, 4, 6, 9, 12, 18, 24] as const;

export interface BnplRules {
  platformEnabled: boolean;
  companyEnabled: boolean;
  terms: number[];
  minAmount: string;
  maxAmount: string;
  /** What the seller pays the platform, in percent of the invoice, by number of parts. The client pays no fee. */
  feePercentByTerm: Record<string, string>;
  minPaidInvoices: number;
  missedLimit: number;
  graceDays: number;
  /** The smallest part worth collecting. */
  minInstallment: string;
}

export const BUILT_IN_BNPL: BnplRules = {
  platformEnabled: false,
  companyEnabled: false,
  terms: [3, 6, 12],
  minAmount: '50',
  maxAmount: '5000',
  feePercentByTerm: { '3': '0', '6': '0', '12': '0' },
  minPaidInvoices: 1,
  missedLimit: 2,
  graceDays: 3,
  minInstallment: '10',
};

const moneyText = z.string().regex(/^\d{1,12}(\.\d{1,4})?$/, 'Enter an amount like 50 or 50.50.');
const percentText = z.string().regex(/^\d{1,2}(\.\d{1,4})?$/, 'Enter a percent like 2 or 2.5.');

export const bnplSettingsInput = z
  .object({
    enabled: z.boolean().nullable().optional(),
    terms: z
      .array(
        z.union([
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(6),
          z.literal(9),
          z.literal(12),
          z.literal(18),
          z.literal(24),
        ]),
      )
      .min(1)
      .max(6)
      .nullable()
      .optional(),
    minAmount: moneyText.nullable().optional(),
    maxAmount: moneyText.nullable().optional(),
    feePercentByTerm: z
      .record(z.string().regex(/^\d{1,2}$/), percentText)
      .nullable()
      .optional(),
    minPaidInvoices: z.number().int().min(0).max(100).nullable().optional(),
    missedLimit: z.number().int().min(1).max(6).nullable().optional(),
    graceDays: z.number().int().min(0).max(30).nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.minAmount && v.maxAmount && Money.parse(v.minAmount).gt(v.maxAmount))
      ctx.addIssue({
        code: 'custom',
        path: ['maxAmount'],
        message: 'The largest amount must not be below the smallest.',
      });
    for (const [term, pct] of Object.entries(v.feePercentByTerm ?? {})) {
      if (Money.parse(pct).gt('30'))
        ctx.addIssue({
          code: 'custom',
          path: ['feePercentByTerm', term],
          message: 'A fee above 30 percent is not allowed.',
        });
    }
  });
export type BnplSettingsInput = z.infer<typeof bnplSettingsInput>;

export interface EligibilityFacts {
  invoiceStatus: string;
  amountDue: string;
  amountPaid: string;
  hasLivePlan: boolean;
  paidInvoices: number;
  overdueInvoices: number;
  riskFlag: 'none' | 'watch' | 'high';
}

export interface Eligibility {
  eligible: boolean;
  /** Plain reasons for the owner when a client is not offered installments (never shown to the client as a score). */
  reasons: string[];
}

const OPEN = ['sent', 'viewed', 'overdue'];

export function eligibility(facts: EligibilityFacts, rules: BnplRules): Eligibility {
  const reasons: string[] = [];
  if (!rules.platformEnabled) reasons.push('Installments are not switched on for the platform.');
  else if (!rules.companyEnabled) reasons.push('Installments are switched off for your company.');
  if (!OPEN.includes(facts.invoiceStatus))
    reasons.push('Installments are offered for an invoice that was sent and is not paid.');
  if (Money.parse(facts.amountPaid).isPositive())
    reasons.push('Part of the invoice is already paid.');
  if (facts.hasLivePlan) reasons.push('The invoice already has an installment plan.');
  const due = Money.parse(facts.amountDue);
  if (due.lt(rules.minAmount))
    reasons.push(`The invoice is below ${Money.parse(rules.minAmount).toDbString()} USD.`);
  if (due.gt(rules.maxAmount))
    reasons.push(`The invoice is above ${Money.parse(rules.maxAmount).toDbString()} USD.`);
  if (facts.riskFlag === 'high') reasons.push('The client is marked as high risk.');
  if (facts.overdueInvoices > 0) reasons.push('The client has an overdue invoice.');
  if (facts.paidInvoices < rules.minPaidInvoices)
    reasons.push(`The client needs ${rules.minPaidInvoices} paid invoice(s) first.`);
  return { eligible: reasons.length === 0, reasons };
}

export interface Offer {
  terms: number;
  rows: InstallmentRow[];
  /** The first part (the others are the same, the last takes the rounding rest). */
  firstAmount: string;
  /** Fee the seller pays the platform; the client always pays the invoice amount and nothing more. */
  sellerFeePercent: string;
  sellerFee: string;
  clientTotal: string;
}

/** Equal monthly parts for each allowed term whose part is at least the smallest worth collecting. */
export function offers(amountDue: string, rules: BnplRules, firstDue: string): Offer[] {
  const total = Money.parse(amountDue);
  const out: Offer[] = [];
  for (const terms of [...rules.terms].sort((a, b) => a - b)) {
    const rows = splitInstallments({
      total: total.toDbString(),
      count: terms,
      firstDue,
      unit: 'month',
      every: 1,
      downPaymentPercent: '0',
    });
    const first = rows[0];
    if (!first || Money.parse(first.amount).lt(rules.minInstallment)) continue;
    const pct = rules.feePercentByTerm[String(terms)] ?? '0';
    out.push({
      terms,
      rows,
      firstAmount: first.amount,
      sellerFeePercent: pct,
      sellerFee: total.percent(pct).toDbString(),
      clientTotal: total.toDbString(),
    });
  }
  return out;
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Parts that are still unpaid and were due more than the grace days ago. */
export function missedParts(
  statuses: readonly InstallmentStatus[],
  today: string,
  graceDays: number,
): number {
  return statuses.filter((s) => s.state !== 'paid' && addDays(s.dueDate, graceDays) < today).length;
}

export type PlanOutcome = 'completed' | 'defaulted' | 'active';

export function planOutcome(input: {
  statuses: readonly InstallmentStatus[];
  today: string;
  graceDays: number;
  missedLimit: number;
}): { outcome: PlanOutcome; missed: number } {
  if (input.statuses.length > 0 && input.statuses.every((s) => s.state === 'paid'))
    return { outcome: 'completed', missed: 0 };
  const missed = missedParts(input.statuses, input.today, input.graceDays);
  return { outcome: missed >= input.missedLimit ? 'defaulted' : 'active', missed };
}

/** The body the settings forms send: lists are text ("3", "3=1.5"), and are turned into the settings input. */
export const bnplFormInput = z
  .object({
    enabled: z.boolean().optional(),
    terms: z
      .array(z.string().regex(/^\d{1,2}$/, 'Use whole numbers like 3;6;12.'))
      .max(6)
      .nullable()
      .optional(),
    feeList: z
      .array(z.string().regex(/^\d{1,2}=\d{1,2}(\.\d{1,4})?$/, 'Use 3=1.5;6=2.5.'))
      .max(8)
      .nullable()
      .optional(),
    minAmount: z.string().nullable().optional(),
    maxAmount: z.string().nullable().optional(),
    minPaidInvoices: z.number().int().nullable().optional(),
    missedLimit: z.number().int().nullable().optional(),
    graceDays: z.number().int().nullable().optional(),
  })
  .strict();
export type BnplFormInput = z.infer<typeof bnplFormInput>;

export function formToSettings(form: BnplFormInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (form.enabled !== undefined) out.enabled = form.enabled;
  if (form.terms !== undefined)
    out.terms = form.terms === null ? null : form.terms.map((x) => toInt(x));
  if (form.feeList !== undefined)
    out.feePercentByTerm =
      form.feeList === null
        ? null
        : Object.fromEntries(form.feeList.map((x) => x.split('=') as [string, string]));
  for (const key of [
    'minAmount',
    'maxAmount',
    'minPaidInvoices',
    'missedLimit',
    'graceDays',
  ] as const) {
    if (form[key] !== undefined) out[key] = form[key];
  }
  return out;
}
