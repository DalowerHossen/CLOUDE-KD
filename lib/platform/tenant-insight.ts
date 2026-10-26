// path: lib/platform/tenant-insight.ts
// Health score and churn signals of one company, as pure functions. The base score comes from the revenue report's own
// rules (unpaid plan, overdue invoices, failed payouts, chargebacks, little use); this adds what the platform team watches
// for leaving customers: a fall in sign-ins, a late plan payment and open urgent support tickets.
import { health, type HealthFacts, type Risk } from '@/lib/payment/analytics-rules';

export interface InsightFacts extends HealthFacts {
  signIns30d: number;
  signInsPrev30d: number;
  planInvoiceDaysLate: number;
  openUrgentTickets: number;
}

export interface Signal {
  key: 'login_drop' | 'payment_delay' | 'support_trouble';
  text: string;
}

export interface Insight {
  score: number;
  risk: Risk;
  reasons: string[];
  signals: Signal[];
}

/** True when sign-ins fell by more than 60 percent against the 30 days before, with enough history to mean something. */
export function loginDrop(current: number, previous: number): boolean {
  return previous >= 5 && current * 5 < previous * 2;
}

export function insight(facts: InsightFacts): Insight {
  const base = health(facts);
  let score = base.score;
  const signals: Signal[] = [];
  if (loginDrop(facts.signIns30d, facts.signInsPrev30d)) {
    score -= 15;
    signals.push({
      key: 'login_drop',
      text: `Sign-ins fell from ${facts.signInsPrev30d} to ${facts.signIns30d} in 30 days.`,
    });
  }
  if (facts.planInvoiceDaysLate > 0) {
    score -= Math.min(20, 5 + facts.planInvoiceDaysLate);
    signals.push({
      key: 'payment_delay',
      text: `The plan invoice is ${facts.planInvoiceDaysLate} day(s) late.`,
    });
  }
  if (facts.openUrgentTickets > 0) {
    score -= Math.min(15, facts.openUrgentTickets * 5);
    signals.push({
      key: 'support_trouble',
      text: `${facts.openUrgentTickets} urgent or high support ticket(s) are open.`,
    });
  }
  score = Math.max(0, score);
  return {
    score,
    risk: score >= 70 ? 'low' : score >= 40 ? 'medium' : 'high',
    reasons: base.reasons,
    signals,
  };
}

/** Whole days between a due date and now, or 0 when it is not late. */
export function daysLate(dueAt: string | null, now: Date = new Date()): number {
  if (dueAt === null) return 0;
  const days = Math.floor((now.getTime() - Date.parse(dueAt)) / 86_400_000);
  return days > 0 ? days : 0;
}
