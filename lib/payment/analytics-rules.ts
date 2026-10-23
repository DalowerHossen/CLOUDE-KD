// path: lib/payment/analytics-rules.ts
// The maths of the revenue reports as pure functions: monthly cohorts and their retention, net revenue retention, and the
// health score of a company that pays the platform. No database here.
import {
  churnPercent,
  lifetimeValue,
  monthlyEquivalent,
} from '@/lib/payment/client-subscription-rules';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';

export interface SubSpan {
  /** When the company started to pay (an ISO time). */
  startedAt: string;
  /** When it ended, or null while it runs. */
  endedAt: string | null;
}

/** "2026-10" for an ISO time. */
export const monthOf = (iso: string): string => iso.slice(0, 7);

export function addMonths(month: string, count: number): string {
  const moved = new Date(
    Date.UTC(toInt(month.slice(0, 4)), toInt(month.slice(5, 7)) - 1 + count, 1),
  );
  return moved.toISOString().slice(0, 7);
}

/** `part` of `whole` as a percent with two decimals. */
export function percentOf(part: number, whole: number): string {
  if (whole <= 0) return '0.00';
  const { integer, fraction } = Money.from(String(part)).mul('100').div(String(whole)).toParts(2);
  return `${integer}.${fraction}`;
}

export interface CohortRow {
  /** The month the cohort started. */
  cohort: string;
  size: number;
  /** Percent of the cohort still paying at the end of month 0, 1, 2 ... (months not reached yet are left out). */
  retention: string[];
}

/** A subscriber is counted in month n when it had not ended before the end of the month n months after the start. */
export function cohorts(
  spans: readonly SubSpan[],
  currentMonth: string,
  maxMonths = 12,
): CohortRow[] {
  const groups = new Map<string, SubSpan[]>();
  for (const s of spans) {
    const key = monthOf(s.startedAt);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.keys()].sort().map((cohort) => {
    const members = groups.get(cohort) ?? [];
    const retention: string[] = [];
    for (let n = 0; n <= maxMonths; n += 1) {
      const month = addMonths(cohort, n);
      if (month > currentMonth) break;
      const kept = members.filter((s) => s.endedAt === null || monthOf(s.endedAt) > month).length;
      retention.push(percentOf(kept, members.length));
    }
    return { cohort, size: members.length, retention };
  });
}

/** Net revenue retention: what the companies that paid at the start pay now (upgrades add, downgrades and churn subtract). */
export function netRevenueRetention(startMrr: Money, sameCompaniesNowMrr: Money): string | null {
  if (!startMrr.isPositive()) return null;
  return sameCompaniesNowMrr.mul('100').div(startMrr.toDbString()).toDbString();
}

export interface HealthFacts {
  status: 'trialing' | 'active' | 'past_due' | 'grace' | 'ended' | 'free';
  openInvoicesOverdue: number;
  failedPayouts90d: number;
  chargebacks90d: number;
  usagePercent: number;
  daysSinceLastInvoice: number | null;
}

export type Risk = 'low' | 'medium' | 'high';

/** A plain score from 0 (worst) to 100 with the reasons, so the team can follow up before a company leaves. */
export function health(facts: HealthFacts): { score: number; risk: Risk; reasons: string[] } {
  let score = 100;
  const reasons: string[] = [];
  if (facts.status === 'past_due' || facts.status === 'grace') {
    score -= 40;
    reasons.push('The plan invoice is unpaid.');
  }
  if (facts.status === 'ended') {
    score -= 60;
    reasons.push('The plan has ended.');
  }
  if (facts.openInvoicesOverdue > 0) {
    score -= Math.min(20, facts.openInvoicesOverdue * 10);
    reasons.push('Invoices of the company are overdue.');
  }
  if (facts.failedPayouts90d > 0) {
    score -= Math.min(20, facts.failedPayouts90d * 10);
    reasons.push('Payouts failed in the last 90 days.');
  }
  if (facts.chargebacks90d > 0) {
    score -= Math.min(30, facts.chargebacks90d * 15);
    reasons.push('Chargebacks in the last 90 days.');
  }
  if (facts.usagePercent < 10 && facts.status !== 'free') {
    score -= 15;
    reasons.push('The company uses very little of its plan.');
  }
  if (facts.daysSinceLastInvoice !== null && facts.daysSinceLastInvoice > 60) {
    score -= 15;
    reasons.push('No invoice was made for more than 60 days.');
  }
  score = Math.max(0, score);
  return { score, risk: score >= 70 ? 'low' : score >= 40 ? 'medium' : 'high', reasons };
}

export { churnPercent, lifetimeValue, monthlyEquivalent };
