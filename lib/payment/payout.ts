// path: lib/payment/payout.ts
// The rules of payouts as pure functions: the states and the moves between them, the fee, the local-currency amount,
// the period window, the retry times, the schedule times, which approval a request needs, the legs of each posting and
// the interface a payout partner implements.
import { z } from 'zod';
import {
  PAYOUT_FEE_FIXED,
  PAYOUT_FEE_PERCENT,
  PAYOUT_FX_FEE_PERCENT,
  PAYOUT_LARGE_THRESHOLD,
  PAYOUT_MIN_AMOUNT,
  PAYOUT_PERIOD_LIMIT,
  PAYOUT_PERIOD_UNIT,
  PAYOUT_RETRY_HOURS,
  PAYOUT_SCHEDULE_HOUR_UTC,
} from '@/config/s14-payouts';
import { Money } from '@/lib/utils/currency';
import type { Leg } from './wallet';

export const PAYOUT_STATUSES = [
  'requested',
  'pending_approval',
  'approved',
  'processing',
  'paid',
  'failed',
  'cancelled',
  'reversed',
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/** Allowed moves. `approved` after `processing` is a retry; `reversed` is after money was sent and came back. */
const MOVES: Record<PayoutStatus, readonly PayoutStatus[]> = {
  requested: ['pending_approval', 'approved', 'cancelled'],
  pending_approval: ['approved', 'cancelled'],
  approved: ['processing', 'cancelled'],
  processing: ['paid', 'approved', 'failed'],
  paid: ['reversed'],
  failed: [],
  cancelled: [],
  reversed: [],
};

export function canMove(from: PayoutStatus, to: PayoutStatus): boolean {
  return MOVES[from].includes(to);
}

/** Terminal states: nothing more happens to the payout. */
export function isFinal(status: PayoutStatus): boolean {
  return MOVES[status].length === 0;
}

/** States in which the money is out of the available balance and not yet sent or returned. */
export function holdsMoney(status: PayoutStatus): boolean {
  return status === 'requested' || status === 'pending_approval' || status === 'approved' || status === 'processing';
}

/* ---------------------------------------------------------------- rules */

export interface PayoutRules {
  minAmount: string;
  periodLimit: string;
  periodUnit: 'day' | 'week' | 'month';
  feeFixed: string;
  feePercent: string;
  fxFeePercent: string;
  largeThreshold: string;
}

export const BUILT_IN_PAYOUT_RULES: PayoutRules = {
  minAmount: PAYOUT_MIN_AMOUNT,
  periodLimit: PAYOUT_PERIOD_LIMIT,
  periodUnit: PAYOUT_PERIOD_UNIT,
  feeFixed: PAYOUT_FEE_FIXED,
  feePercent: PAYOUT_FEE_PERCENT,
  fxFeePercent: PAYOUT_FX_FEE_PERCENT,
  largeThreshold: PAYOUT_LARGE_THRESHOLD,
};

const moneyText = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 1500 or 1500.50.');
const percentText = z.string().regex(/^\d{1,2}(\.\d{1,4})?$/, 'Enter a percent like 1 or 2.5.');

export const payoutSettingsInput = z
  .object({
    minAmount: moneyText.nullable().optional(),
    periodLimit: moneyText.nullable().optional(),
    periodUnit: z.enum(['day', 'week', 'month']).nullable().optional(),
    feeFixed: moneyText.nullable().optional(),
    feePercent: percentText.nullable().optional(),
    fxFeePercent: percentText.nullable().optional(),
    largeThreshold: moneyText.nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const key of ['feePercent', 'fxFeePercent'] as const) {
      const value = v[key];
      if (value && Money.parse(value).gt('20'))
        ctx.addIssue({ code: 'custom', path: [key], message: 'The percent cannot be above 20.' });
    }
    for (const key of ['minAmount', 'periodLimit', 'largeThreshold'] as const) {
      const value = v[key];
      if (value && !Money.parse(value).isPositive())
        ctx.addIssue({ code: 'custom', path: [key], message: 'The amount must be above zero.' });
    }
  });
export type PayoutSettingsInput = z.infer<typeof payoutSettingsInput>;

/* ---------------------------------------------------------------- amounts */

export interface PayoutAmounts {
  amount: Money;
  fee: Money;
  net: Money;
}

/** The fee is a fixed part plus a percent of the amount, and never more than the amount. */
export function payoutAmounts(amount: Money, rules: Pick<PayoutRules, 'feeFixed' | 'feePercent'>): PayoutAmounts {
  const raw = Money.parse(rules.feeFixed).add(amount.percent(rules.feePercent));
  const fee = raw.gt(amount) ? amount : raw;
  return { amount, fee, net: amount.sub(fee) };
}

/** The amount paid in the local currency: net times the rate frozen at the request, less the conversion margin. */
export function localAmount(net: Money, rate: string, fxFeePercent: string): Money {
  const converted = net.mul(rate);
  return converted.sub(converted.percent(fxFeePercent));
}

/** The smallest payout that is worth its fee: the amount must be above the fee and at least the minimum. */
export function checkAmount(amount: Money, rules: PayoutRules): string | null {
  if (!amount.isPositive()) return 'The payout amount must be above zero.';
  if (amount.lt(rules.minAmount)) return `The smallest payout is ${Money.parse(rules.minAmount).toDbString()} USD.`;
  if (payoutAmounts(amount, rules).net.isZero()) return 'The payout fee is not less than the amount.';
  return null;
}

/** Which approval a request needs, or null when it can go ahead. Large amounts always need a second person. */
export function approvalNeeded(
  role: string,
  amount: Money,
  largeThreshold: string,
): 'payout.request' | 'payout.large' | null {
  if (amount.gte(largeThreshold)) return 'payout.large';
  return role === 'staff' ? 'payout.request' : null;
}

/* ---------------------------------------------------------------- time */

/** Start of the period (UTC) that holds `at`: the day, the week from Monday, or the month. */
export function periodStart(at: Date, unit: PayoutRules['periodUnit']): Date {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  if (unit === 'week') return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  if (unit === 'month') return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  return d;
}

/** When a failed attempt is tried again; null after the last retry. `attempts` counts attempts made so far (at least 1). */
export function retryAt(attempts: number, now: Date): Date | null {
  const hours = PAYOUT_RETRY_HOURS[attempts - 1];
  return hours === undefined ? null : new Date(now.getTime() + hours * 3_600_000);
}

export const MAX_ATTEMPTS = PAYOUT_RETRY_HOURS.length + 1;

export type Frequency = 'daily' | 'weekly' | 'monthly';

/** The next run strictly after `from`: at the fixed hour (UTC) of the next day, the weekday (0 Sunday) or the month day (1 to 28). */
export function nextRun(from: Date, frequency: Frequency, weekday: number | null, monthDay: number | null): Date {
  const at = (y: number, mo: number, d: number): Date => new Date(Date.UTC(y, mo, d, PAYOUT_SCHEDULE_HOUR_UTC));
  const y = from.getUTCFullYear();
  const mo = from.getUTCMonth();
  const d = from.getUTCDate();
  if (frequency === 'daily') {
    const today = at(y, mo, d);
    return today.getTime() > from.getTime() ? today : at(y, mo, d + 1);
  }
  if (frequency === 'weekly') {
    const target = weekday ?? 1;
    for (let add = 0; add <= 7; add += 1) {
      const candidate = at(y, mo, d + add);
      if (candidate.getUTCDay() === target && candidate.getTime() > from.getTime()) return candidate;
    }
  }
  const day = monthDay ?? 1;
  const thisMonth = at(y, mo, day);
  return thisMonth.getTime() > from.getTime() ? thisMonth : at(y, mo + 1, day);
}

/* ---------------------------------------------------------------- postings */

/** The request: the amount leaves the available balance; the platform keeps the fee and holds the net for the partner. */
export function requestLegs(walletId: string, p: PayoutAmounts): Leg[] {
  return [
    { walletId, account: 'available', amount: p.amount.negate() },
    { walletId: null, account: 'payout_in_transit', amount: p.net },
    ...(p.fee.isPositive() ? [{ walletId: null, account: 'platform_fee_revenue' as const, amount: p.fee }] : []),
  ];
}

/** The payout is sent: what was held for the partner leaves the platform. */
export function paidLegs(p: PayoutAmounts): Leg[] {
  return [
    { walletId: null, account: 'payout_in_transit', amount: p.net.negate() },
    { walletId: null, account: 'clearing', amount: p.net },
  ];
}

/** The payout did not happen before it was sent: everything goes back to the available balance, fee included. */
export function creditBackLegs(walletId: string, p: PayoutAmounts): Leg[] {
  return [
    { walletId, account: 'available', amount: p.amount },
    { walletId: null, account: 'payout_in_transit', amount: p.net.negate() },
    ...(p.fee.isPositive() ? [{ walletId: null, account: 'platform_fee_revenue' as const, amount: p.fee.negate() }] : []),
  ];
}

/** The money came back after it was sent. */
export function reversedLegs(walletId: string, p: PayoutAmounts): Leg[] {
  return [
    { walletId, account: 'available', amount: p.amount },
    { walletId: null, account: 'clearing', amount: p.net.negate() },
    ...(p.fee.isPositive() ? [{ walletId: null, account: 'platform_fee_revenue' as const, amount: p.fee.negate() }] : []),
  ];
}

/* ---------------------------------------------------------------- partners */

export interface PartnerRequest {
  payoutId: string;
  /** What is sent, in USD. */
  net: string;
  /** The local currency and amount when the payout is paid in a local currency. */
  currency: string;
  localAmount: string | null;
  /** Never logged; the partner decrypts what it needs through the method. */
  methodId: string;
  attempt: number;
}

export type PartnerAnswer =
  | { kind: 'accepted'; reference: string | null; completed: boolean }
  | { kind: 'rejected'; reason: string };

/** What a Global Payout Partner adapter implements. The manual partner needs no vendor API. */
export interface PayoutPartner {
  id: string;
  label: string;
  /** True when the partner finishes the payout by itself (a status call), false when a person confirms it. */
  automatic: boolean;
  healthy(): Promise<boolean>;
  submit(request: PartnerRequest): Promise<PartnerAnswer>;
}
