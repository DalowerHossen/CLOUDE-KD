// path: lib/procurement/totals.ts
// Totals of a purchase order: each line is quantity times cost, rounded to four places; tax is worked out per line.
// Pure, decimal arithmetic.
import { Money } from '@/lib/utils/currency';

export interface OrderLineInput {
  quantity: string;
  unitCost: string;
  taxRate: string;
}

export function lineTotal(line: Pick<OrderLineInput, 'quantity' | 'unitCost'>): Money {
  return Money.parse(line.unitCost).mul(line.quantity);
}

export function computeTotals(lines: readonly OrderLineInput[]): {
  subtotal: string;
  taxTotal: string;
  total: string;
  lineTotals: string[];
} {
  let subtotal = Money.zero();
  let tax = Money.zero();
  const lineTotals: string[] = [];
  for (const l of lines) {
    const t = lineTotal(l);
    lineTotals.push(t.toDbString());
    subtotal = subtotal.add(t);
    tax = tax.add(t.percent(l.taxRate));
  }
  return {
    subtotal: subtotal.toDbString(),
    taxTotal: tax.toDbString(),
    total: subtotal.add(tax).toDbString(),
    lineTotals,
  };
}
