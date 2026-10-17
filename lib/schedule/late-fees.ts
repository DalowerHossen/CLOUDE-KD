// path: lib/schedule/late-fees.ts
// Late fee rules: which periods are due for an overdue invoice and how much each fee is. A fee is worked out on the
// balance at the time (not on earlier fees, so fees never compound) and stops at the cap. Pure.
import { daysBetween } from '@/lib/invoice/terms';
import { floorDiv } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';

export interface LateRule {
  kind: 'percent' | 'fixed';
  value: string;
  repeat: 'once' | 'monthly';
  graceDays: number;
  /** Total fees of one invoice stay below this share (percent) of the invoice total. */
  capPercent: string | null;
  /** Total fees of one invoice stay below this amount. */
  capAmount: string | null;
}

export const PERIOD_DAYS = 30;

/** Period keys ("m1", "m2", ...) that are due by today. "once" gives only m1. */
export function periodsDue(dueDate: string, today: string, rule: LateRule): string[] {
  const late = daysBetween(dueDate, today) - rule.graceDays;
  if (late <= 0) return [];
  const count = rule.repeat === 'once' ? 1 : floorDiv(late - 1, PERIOD_DAYS) + 1;
  return Array.from({ length: count }, (_, i) => `m${i + 1}`);
}

/** The fee for one period, or zero when the cap is reached. `already` is the sum of fees of this invoice so far. */
export function lateFeeAmount(
  rule: LateRule,
  balance: Money,
  invoiceTotal: Money,
  already: Money,
): Money {
  if (!balance.isPositive()) return Money.zero();
  const base = rule.kind === 'percent' ? balance.percent(rule.value) : Money.parse(rule.value);
  const caps: Money[] = [];
  if (rule.capAmount !== null) caps.push(Money.parse(rule.capAmount));
  if (rule.capPercent !== null) caps.push(invoiceTotal.percent(rule.capPercent));
  if (caps.length === 0) return base;
  const room = caps.reduce((a, b) => Money.min(a, b)).sub(already);
  return room.isPositive() ? Money.min(base, room) : Money.zero();
}
