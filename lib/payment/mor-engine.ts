// path: lib/payment/mor-engine.ts
// The rules of merchant-of-record settlement as pure functions: which mode a company is in, how long a payment is held,
// how risky a payment looks, how much is kept in reserve, how a refund is taken back and how settlement cycles are
// cut. No database here, so every rule can be checked without one.
import { z } from 'zod';
import { Money } from '@/lib/utils/currency';
import type { Leg } from './wallet';

export const MOR_MODES = ['mor', 'direct', 'suspended'] as const;
export type MorMode = (typeof MOR_MODES)[number];

export const MODE_REASONS = [
  'ready',
  'platform_off',
  'company_off',
  'suspended',
  'kyc_missing',
  'kyc_pending',
  'kyc_rejected',
  'kyc_expired',
] as const;
export type ModeReason = (typeof MODE_REASONS)[number];

/** The rules after the company values, the platform values and the built-in values are put together. */
export interface MorRules {
  platformEnabled: boolean;
  companyEnabled: boolean;
  holdDays: number;
  newMerchantHoldDays: number;
  newMerchantDays: number;
  reservePercent: string;
  reserveDays: number;
  cycleDays: 1 | 3 | 7;
  dailyLimit: string | null;
  largePayment: string | null;
  velocityCount: number;
  autoSuspend: boolean;
  riskExtensionDays: number;
}

export const BUILT_IN_RULES: MorRules = {
  platformEnabled: false,
  companyEnabled: true,
  holdDays: 7,
  newMerchantHoldDays: 14,
  newMerchantDays: 30,
  reservePercent: '0',
  reserveDays: 90,
  cycleDays: 1,
  dailyLimit: null,
  largePayment: null,
  velocityCount: 200,
  autoSuspend: true,
  riskExtensionDays: 7,
};

const moneyText = z
  .string()
  .regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 1500 or 1500.50.');
const percentText = z.string().regex(/^\d{1,2}(\.\d{1,4})?$/, 'Enter a percent like 5 or 2.5.');

/** What the platform team may set. Every field is optional: a missing field falls back to the platform, then built-in. */
export const morSettingsInput = z
  .object({
    enabled: z.boolean().nullable().optional(),
    holdDays: z.number().int().min(0).max(90).nullable().optional(),
    newMerchantHoldDays: z.number().int().min(0).max(90).nullable().optional(),
    newMerchantDays: z.number().int().min(0).max(365).nullable().optional(),
    reservePercent: percentText.nullable().optional(),
    reserveDays: z.number().int().min(0).max(365).nullable().optional(),
    cycleDays: z
      .union([z.literal(1), z.literal(3), z.literal(7)])
      .nullable()
      .optional(),
    dailyLimit: moneyText.nullable().optional(),
    largePayment: moneyText.nullable().optional(),
    velocityCount: z.number().int().min(1).max(100000).nullable().optional(),
    autoSuspend: z.boolean().nullable().optional(),
    riskExtensionDays: z.number().int().min(0).max(90).nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.reservePercent !== null &&
      v.reservePercent !== undefined &&
      Money.parse(v.reservePercent).gt('50')
    )
      ctx.addIssue({
        code: 'custom',
        path: ['reservePercent'],
        message: 'The reserve cannot be above 50 percent.',
      });
  });
export type MorSettingsInput = z.infer<typeof morSettingsInput>;

/* ---------------------------------------------------------------- mode */

export interface KycFacts {
  status: 'not_submitted' | 'submitted' | 'in_review' | 'approved' | 'rejected';
  verified: boolean;
  expired: boolean;
}

export interface ModeDecision {
  mode: MorMode;
  reason: ModeReason;
  /** Plain words for the owner. */
  message: string;
}

const MODE_TEXT: Record<ModeReason, string> = {
  ready:
    'The platform collects your online payments and pays them into your wallet after the hold period.',
  platform_off:
    'Wallet settlement is not switched on for the platform yet. Your online payments are recorded and the platform fee is billed to you.',
  company_off:
    'Wallet settlement is switched off for your company. Your online payments are recorded and the platform fee is billed to you.',
  suspended:
    'Wallet settlement is paused for your company. New payments wait until the platform team reviews the account. Money already held stays safe.',
  kyc_missing:
    'Verify your business to unlock wallet settlement. Until then your payments are recorded and the fee is billed to you.',
  kyc_pending: 'Your verification is in review. Wallet settlement starts when it is approved.',
  kyc_rejected:
    'Your verification was not approved. Update your details and send them again to unlock wallet settlement.',
  kyc_expired:
    'Your verification has ended, so wallet settlement is paused. Renew it to start again.',
};

export function decideMode(input: {
  platformEnabled: boolean;
  companyEnabled: boolean;
  suspended: boolean;
  kyc: KycFacts;
}): ModeDecision {
  const make = (mode: MorMode, reason: ModeReason): ModeDecision => ({
    mode,
    reason,
    message: MODE_TEXT[reason],
  });
  if (input.suspended) return make('suspended', 'suspended');
  if (!input.platformEnabled) return make('direct', 'platform_off');
  if (!input.companyEnabled) return make('direct', 'company_off');
  if (input.kyc.expired) return make('suspended', 'kyc_expired');
  if (input.kyc.verified) return make('mor', 'ready');
  switch (input.kyc.status) {
    case 'rejected':
      return make('direct', 'kyc_rejected');
    case 'submitted':
    case 'in_review':
      return make('direct', 'kyc_pending');
    default:
      return make('direct', 'kyc_missing');
  }
}

/* ---------------------------------------------------------------- risk */

export interface RiskFacts {
  amount: Money;
  /** Captured payments of the company in the last 24 hours (this one included). */
  count24h: number;
  amount24h: Money;
  /** Disputes opened in the last 90 days. */
  disputes90d: number;
  /** Refunds of the last 90 days as a percent of captured (whole number). */
  refundPercent90d: number;
  merchantAgeDays: number;
}

export interface RiskResult {
  score: number;
  level: 'low' | 'medium' | 'high';
  reasons: string[];
}

export const RISK_MEDIUM = 40;
export const RISK_HIGH = 70;

/** Simple rules, each adds points; the reasons are kept so the platform team can see why. */
export function scoreRisk(rules: MorRules, facts: RiskFacts): RiskResult {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string): void => {
    score += points;
    reasons.push(reason);
  };
  if (rules.largePayment && facts.amount.gte(rules.largePayment)) add(30, 'large payment');
  if (facts.count24h > rules.velocityCount) add(30, 'many payments in 24 hours');
  if (rules.dailyLimit && facts.amount24h.gt(rules.dailyLimit)) add(30, 'daily limit passed');
  if (facts.disputes90d >= 3) add(40, 'three or more disputes in 90 days');
  else if (facts.disputes90d >= 1) add(20, 'a dispute in 90 days');
  if (facts.refundPercent90d >= 20) add(20, 'high refund rate');
  if (facts.merchantAgeDays < rules.newMerchantDays) add(10, 'new merchant');
  const level = score >= RISK_HIGH ? 'high' : score >= RISK_MEDIUM ? 'medium' : 'low';
  return { score, level, reasons };
}

/* ---------------------------------------------------------------- hold */

export interface HoldPlan {
  days: number;
  /** The reason the owner sees on the payment. */
  text: string;
}

export function holdPlan(
  rules: MorRules,
  facts: { merchantAgeDays: number; riskLevel: RiskResult['level'] },
): HoldPlan {
  const isNew = facts.merchantAgeDays < rules.newMerchantDays;
  let days = isNew
    ? rules.newMerchantHoldDays > rules.holdDays
      ? rules.newMerchantHoldDays
      : rules.holdDays
    : rules.holdDays;
  const parts: string[] = [
    isNew
      ? `New merchant hold of ${days} days (your account is younger than ${rules.newMerchantDays} days).`
      : `Standard hold of ${days} days.`,
  ];
  if (facts.riskLevel === 'high' && rules.riskExtensionDays > 0) {
    days += rules.riskExtensionDays;
    parts.push(`Extended by ${rules.riskExtensionDays} days after an automatic risk check.`);
  }
  return { days, text: parts.join(' ').slice(0, 300) };
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

/** Splits what the company receives into the part that follows the normal hold and the reserve held longer. */
export function splitReserve(net: Money, reservePercent: string): { main: Money; reserve: Money } {
  const reserve = net.isPositive() ? net.percent(reservePercent) : Money.zero();
  return { main: net.sub(reserve), reserve };
}

/* ---------------------------------------------------------------- refunds */

/**
 * What a refund takes back. The platform returns its fee in the same share as the refund (the company is not charged
 * a fee on money that went back to the client). `refundedBefore` is what earlier refunds already returned.
 */
export function refundTakeBack(input: {
  gross: Money;
  fee: Money;
  refundedBefore: Money;
  feeReturnedBefore: Money;
  refund: Money;
}): { companyDebit: Money; feeBack: Money } {
  const total = input.refundedBefore.add(input.refund);
  const feeBackTotal = total.gte(input.gross)
    ? input.fee
    : input.fee.mul(total.div(input.gross.toDbString()).toDbString());
  const feeBack = Money.max(
    Money.zero(),
    Money.min(feeBackTotal.sub(input.feeReturnedBefore), input.refund),
  );
  return { companyDebit: input.refund.sub(feeBack), feeBack };
}

/* ---------------------------------------------------------------- cycles */

/** The settlement period (UTC dates) that holds `day`. Periods are `cycleDays` long and line up from 1970-01-01. */
export function cyclePeriod(day: Date, cycleDays: 1 | 3 | 7): { start: string; end: string } {
  const ms = day.getTime();
  const dayNumber = (ms - (ms % 86_400_000)) / 86_400_000;
  const startNumber = dayNumber - (dayNumber % cycleDays);
  const iso = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);
  return { start: iso(startNumber), end: iso(startNumber + cycleDays - 1) };
}

/** True when the whole period is in the past, so its report can be closed. */
export function periodEnded(periodEnd: string, now: Date): boolean {
  return Date.parse(`${periodEnd}T23:59:59.999Z`) < now.getTime();
}

/* ---------------------------------------------------------------- postings */

/** The legs of a settlement: the company gets `main` (held, or available when there is no hold); the platform keeps the fees. */
export function settlementLegs(input: {
  walletId: string;
  main: Money;
  fees: Money;
  instant: boolean;
}): Leg[] {
  const { walletId, main, fees } = input;
  return [
    ...(main.isPositive()
      ? [
          {
            walletId,
            account: input.instant ? ('available' as const) : ('held' as const),
            amount: main,
          },
        ]
      : []),
    ...(fees.isPositive()
      ? [{ walletId: null, account: 'platform_fee_revenue' as const, amount: fees }]
      : []),
    { walletId: null, account: 'processor_receivable' as const, amount: main.add(fees).negate() },
  ];
}

/** The legs of the reserve: held for longer than the normal hold. */
export function reserveLegs(walletId: string, reserve: Money): Leg[] {
  return [
    { walletId, account: 'held', amount: reserve },
    { walletId: null, account: 'processor_receivable', amount: reserve.negate() },
  ];
}

/** The legs of a refund: the company pays back what it received, the platform gives back its fee share. */
export function refundLegs(input: {
  walletId: string;
  refund: Money;
  companyDebit: Money;
  feeBack: Money;
}): Leg[] {
  return [
    ...(input.companyDebit.isPositive()
      ? [
          {
            walletId: input.walletId,
            account: 'available' as const,
            amount: input.companyDebit.negate(),
            floor: false,
          },
        ]
      : []),
    ...(input.feeBack.isPositive()
      ? [
          {
            walletId: null,
            account: 'platform_fee_revenue' as const,
            amount: input.feeBack.negate(),
          },
        ]
      : []),
    { walletId: null, account: 'processor_receivable' as const, amount: input.refund },
  ];
}

/** The legs of a lost dispute: the disputed amount leaves the wallet, even below zero. */
export function chargebackLegs(walletId: string, amount: Money): Leg[] {
  return [
    { walletId, account: 'available', amount: amount.negate(), floor: false },
    { walletId: null, account: 'processor_receivable', amount },
  ];
}
