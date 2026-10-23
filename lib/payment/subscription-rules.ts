// path: lib/payment/subscription-rules.ts
// The rules of platform subscriptions as pure functions: billing periods, prices, daily proration of a plan change,
// tax, the renewal invoice time, the reminder days, the three dunning attempts, the grace period and what happens after
// it. No database here, so every rule can be checked without one.
import {
  DUNNING_DAYS,
  GRACE_DAYS,
  RENEWAL_INVOICE_DAYS,
  RENEWAL_REMINDER_DAYS,
} from '@/config/s14-subscriptions';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';

export type Interval = 'month' | 'year';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'grace' | 'ended';

const DAY = 86_400_000;

/** One period after `from`. The day of the month is kept, or the last day of a shorter month. */
export function addInterval(from: Date, interval: Interval, count = 1): Date {
  const months = interval === 'year' ? 12 * count : count;
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      m,
      from.getUTCDate() > lastDay ? lastDay : from.getUTCDate(),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
    ),
  );
}

export function addDaysTo(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY);
}

export interface PricedPlan {
  priceMonthly: string;
  priceYearly: string;
  seatPriceMonthly: string;
}

/** The price of one period: the plan price plus the seats above those the plan includes. */
export function periodAmount(plan: PricedPlan, interval: Interval, extraSeats: number): Money {
  const base = Money.parse(interval === 'year' ? plan.priceYearly : plan.priceMonthly);
  const seats =
    extraSeats > 0
      ? Money.parse(plan.seatPriceMonthly).mul(String(extraSeats * (interval === 'year' ? 12 : 1)))
      : Money.zero();
  return base.add(seats);
}

/** Seats to bill: the active seats above the plan's included seats (null included seats means unlimited, nothing extra). */
export function extraSeatsOf(activeSeats: number, includedSeats: number | null): number {
  if (includedSeats === null) return 0;
  return activeSeats > includedSeats ? activeSeats - includedSeats : 0;
}

export interface Proration {
  /** Whole days left in the period, counted up. */
  remainingDays: number;
  totalDays: number;
  /** The unused part of what was paid for the old plan. */
  credit: Money;
  /** The part of the new plan for the days left. */
  charge: Money;
  /** What is billed now: the charge minus the credit, never below zero. */
  net: Money;
}

/** Daily proration of a plan change inside a paid period. */
export function prorate(input: {
  oldAmount: Money;
  newAmount: Money;
  periodStart: Date;
  periodEnd: Date;
  at: Date;
}): Proration {
  const totalDays =
    toInt((input.periodEnd.getTime() - input.periodStart.getTime() + DAY - 1) / DAY, 1) || 1;
  const leftMs = input.periodEnd.getTime() - input.at.getTime();
  const raw = leftMs <= 0 ? 0 : toInt((leftMs + DAY - 1) / DAY, 0);
  const remainingDays = raw > totalDays ? totalDays : raw;
  const part = (amount: Money): Money => amount.mul(String(remainingDays)).div(String(totalDays));
  const credit = part(input.oldAmount);
  const charge = part(input.newAmount);
  const net = charge.gt(credit) ? charge.sub(credit) : Money.zero();
  return { remainingDays, totalDays, credit, charge, net };
}

export interface Totals {
  subtotal: Money;
  taxAmount: Money;
  total: Money;
}

export function withTax(subtotal: Money, taxPercent: string): Totals {
  const taxAmount = subtotal.percent(taxPercent);
  return { subtotal, taxAmount, total: subtotal.add(taxAmount) };
}

/** The tax percent for the buyer's country: the country value, otherwise the default. */
export function taxPercentFor(
  country: string | null,
  byCountry: Readonly<Record<string, string>>,
  fallback: string,
): string {
  return country && byCountry[country] !== undefined ? byCountry[country] : fallback;
}

/** When the renewal invoice is made: a few days before the period ends. */
export function renewalInvoiceAt(periodEnd: Date, days: number = RENEWAL_INVOICE_DAYS): Date {
  return addDaysTo(periodEnd, -days);
}

/** The reminder (7, 3 or 1 day before renewal) that is due now and has not been sent, or null. The soonest one wins. */
export function reminderDue(periodEnd: Date, now: Date, sent: ReadonlySet<number>): number | null {
  const left = (periodEnd.getTime() - now.getTime()) / DAY;
  if (left <= 0) return null;
  const candidates = [...RENEWAL_REMINDER_DAYS]
    .sort((a, b) => a - b)
    .filter((d) => left <= d && !sent.has(d));
  if (candidates.length === 0) return null;
  // Older reminders that were missed are marked as handled by the caller; only the soonest day is sent.
  return candidates[0] ?? null;
}

/** The time of the next payment attempt for an unpaid invoice, or null when all attempts were made. */
export function nextAttemptAt(
  dueAt: Date,
  attemptsMade: number,
  days: readonly number[] = DUNNING_DAYS,
): Date | null {
  const offset = days[attemptsMade];
  return offset === undefined ? null : addDaysTo(dueAt, offset);
}

export type DunningOutcome =
  | { kind: 'wait' }
  | { kind: 'attempt'; number: number; last: boolean; nextAt: Date | null }
  | { kind: 'grace_end' };

/**
 * What to do now for an unpaid invoice. An attempt is due once its day has come. After the last attempt the company
 * has the grace period; when that ends the company moves to the free plan (its data stays).
 */
export function dunningStep(input: {
  dueAt: Date;
  attemptsMade: number;
  now: Date;
  graceEndsAt: Date | null;
  days?: readonly number[];
}): DunningOutcome {
  const days = input.days ?? DUNNING_DAYS;
  if (input.graceEndsAt && input.now.getTime() >= input.graceEndsAt.getTime())
    return { kind: 'grace_end' };
  const due = nextAttemptAt(input.dueAt, input.attemptsMade, days);
  if (!due || input.now.getTime() < due.getTime()) return { kind: 'wait' };
  const number = input.attemptsMade + 1;
  return {
    kind: 'attempt',
    number,
    last: number >= days.length,
    nextAt: nextAttemptAt(input.dueAt, number, days),
  };
}

export function graceEndsAt(from: Date, graceDays: number = GRACE_DAYS): Date {
  return addDaysTo(from, graceDays);
}

/** A trial that has run out without a paid invoice. */
export function trialExpired(trialEndsAt: Date | null, now: Date): boolean {
  return trialEndsAt !== null && now.getTime() >= trialEndsAt.getTime();
}

export type PlanChange = 'upgrade' | 'downgrade' | 'same';

/** Compare two plans by what one period costs: dearer is an upgrade, cheaper a downgrade. */
export function changeKind(oldAmount: Money, newAmount: Money): PlanChange {
  return newAmount.gt(oldAmount) ? 'upgrade' : newAmount.lt(oldAmount) ? 'downgrade' : 'same';
}
