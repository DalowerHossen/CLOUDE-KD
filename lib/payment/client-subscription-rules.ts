// path: lib/payment/client-subscription-rules.ts
// The rules of the subscriptions a company sells to its clients, as pure functions: plan input, the price of a cycle with
// extra seats, the monthly equivalent used by the reports, MRR, churn and lifetime value, and how a pause moves the next
// billing date. No database here.
import { z } from 'zod';
import { partialPatch } from '@/lib/security/zod-strict';
import { Money } from '@/lib/utils/currency';

const moneyText = z.string().regex(/^\d{1,12}(\.\d{1,4})?$/, 'Enter a price like 49 or 49.50.');
const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const clientPlanInput = z
  .object({
    name: plain(1, 100),
    description: plain(0, 500).default(''),
    price: moneyText.refine((v) => Money.parse(v).isPositive(), {
      message: 'The price must be above zero.',
    }),
    interval: z.enum(['month', 'year']).default('month'),
    trialDays: z.number().int().min(0).max(90).default(0),
    features: z.array(plain(1, 120)).max(20).default([]),
    seatPrice: moneyText.default('0'),
    includedSeats: z.number().int().min(1).max(10000).default(1),
  })
  .strict();
export type ClientPlanInput = z.infer<typeof clientPlanInput>;

/** What may change on a plan later. A change does not change what clients who already joined pay. */
export const clientPlanUpdate = partialPatch(clientPlanInput.omit({ interval: true })).strict();

export interface Priced {
  price: string;
  seatPrice: string;
  includedSeats: number;
  seats: number;
}

/** The price of one cycle: the plan price plus the seats above the included seats. */
export function cycleAmount(p: Priced): Money {
  const extra = p.seats > p.includedSeats ? p.seats - p.includedSeats : 0;
  const base = Money.parse(p.price);
  return extra > 0 ? base.add(Money.parse(p.seatPrice).mul(String(extra))) : base;
}

/** A yearly amount counted per month, for MRR. */
export function monthlyEquivalent(amount: Money, interval: 'month' | 'year'): Money {
  return interval === 'year' ? amount.div('12') : amount;
}

export function mrrOf(subs: readonly (Priced & { interval: 'month' | 'year' })[]): Money {
  return Money.sum(subs.map((s) => monthlyEquivalent(cycleAmount(s), s.interval)));
}

/** Percent of the subscribers at the start of a period who left during it, with two decimals; null when nobody started. */
export function churnPercent(startActive: number, left: number): string | null {
  if (startActive <= 0) return null;
  return Money.from(String(left))
    .mul('100')
    .div(String(startActive))
    .toDbString()
    .replace(/(\.\d\d)\d*$/, '$1');
}

/** Lifetime value = average monthly revenue per subscriber divided by the monthly churn rate; null without churn. */
export function lifetimeValue(arpu: Money, monthlyChurnPercent: string | null): Money | null {
  if (!monthlyChurnPercent || !Money.parse(monthlyChurnPercent).isPositive()) return null;
  return arpu.mul('100').div(monthlyChurnPercent);
}

/** A pause moves the next billing date by the time the subscription was paused. */
export function shiftAfterPause(next: Date, pausedAt: Date, resumedAt: Date): Date {
  const gap = resumedAt.getTime() - pausedAt.getTime();
  return new Date(next.getTime() + (gap > 0 ? gap : 0));
}
