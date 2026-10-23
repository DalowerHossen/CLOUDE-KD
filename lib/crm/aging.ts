// path: lib/crm/aging.ts
// Aging of open documents: how late each unpaid amount is on a given day. Pure, money uses decimal arithmetic.
import { Money } from '@/lib/utils/currency';
import type { OpenDocument } from './hooks';

export const AGING_BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd91_plus'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

const DAY = 86_400_000;

/** Days late on `asOf` (both YYYY-MM-DD); zero or less means not yet due. */
export function daysLate(dueOn: string, asOf: string): number {
  return Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${dueOn}T00:00:00Z`)) / DAY);
}

export function bucketOf(days: number): AgingBucket {
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd91_plus';
}

export function ageDocuments(
  documents: readonly OpenDocument[],
  asOf: string,
): Record<AgingBucket, Money> & { total: Money } {
  const out: Record<AgingBucket, Money> = {
    current: Money.zero(),
    d1_30: Money.zero(),
    d31_60: Money.zero(),
    d61_90: Money.zero(),
    d91_plus: Money.zero(),
  };
  let total = Money.zero();
  for (const d of documents) {
    const b = bucketOf(daysLate(d.dueOn, asOf));
    out[b] = out[b].add(d.due);
    total = total.add(d.due);
  }
  return { ...out, total };
}
