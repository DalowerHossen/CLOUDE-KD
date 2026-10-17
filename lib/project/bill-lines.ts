// path: lib/project/bill-lines.ts
// Turns approved time into invoice lines: one line per entry, day or person, or one line in all, and the retainer split
// between the hours the fee covers and the hours above it. Pure; safe to import in the browser.
import type { InvoiceLineInput } from '@/lib/invoice/input';
import type { BillGrouping } from '@/lib/project/input';
import { Money } from '@/lib/utils/currency';

export interface Claimed {
  id: string;
  workDate: string;
  userId: string;
  hours: string;
  rate: string;
  description: string;
}

export function lineOf(
  base: InvoiceLineInput,
  description: string,
  quantity: string,
  price: string,
  unit: string,
): InvoiceLineInput {
  return {
    ...base,
    description: description.slice(0, 2000),
    quantity,
    unit,
    unitPrice: Money.parse(price).toDbString(),
  };
}

export function hourLines(
  base: InvoiceLineInput,
  entries: Claimed[],
  grouping: BillGrouping,
  override: string | null,
  projectName: string,
  names: Map<string, string>,
): InvoiceLineInput[] {
  const rateOf = (e: Claimed): string => override ?? e.rate;
  if (grouping === 'entry')
    return entries.map((e) =>
      lineOf(
        base,
        `${e.workDate} ${names.get(e.userId) ?? ''}: ${e.description || projectName}`.replace(
          /\s+:/,
          ':',
        ),
        e.hours,
        rateOf(e),
        'hour',
      ),
    );
  const groups = new Map<string, { label: string; hours: Money; rate: string }>();
  for (const e of entries) {
    const rate = rateOf(e);
    const key =
      grouping === 'day'
        ? `${e.workDate}|${rate}`
        : grouping === 'person'
          ? `${e.userId}|${rate}`
          : rate;
    const label =
      grouping === 'day'
        ? `${projectName} - ${e.workDate}`
        : grouping === 'person'
          ? `${projectName} - ${names.get(e.userId) ?? 'Team member'}`
          : `${projectName} - hours`;
    const cell = groups.get(key) ?? { label, hours: Money.zero(), rate };
    cell.hours = cell.hours.add(e.hours);
    groups.set(key, cell);
  }
  return [...groups.values()].map((g) =>
    lineOf(base, g.label, g.hours.toDbString().slice(0, -2), g.rate, 'hour'),
  );
}

/** Hours the retainer fee covers and hours above it. */
export function retainerSplit(
  total: Money,
  includedHours: string,
): { included: Money; over: Money } {
  const included = Money.parse(includedHours);
  return { included, over: total.gt(included) ? total.sub(included) : Money.zero() };
}
