// path: lib/procurement/statement.ts
// Supplier statement lines with a running balance (what we owe). Pure, decimal arithmetic.
import { Money } from '@/lib/utils/currency';

export interface StatementEvent {
  on: string;
  kind: 'bill' | 'remittance';
  reference: string;
  /** Always positive; a bill raises the balance, a remittance lowers it. */
  amount: string;
}
export interface StatementLine extends StatementEvent {
  balance: string;
}

/** Orders the events by date (bills before remittances on the same day) and adds the running balance. */
export function buildStatement(
  opening: string,
  events: readonly StatementEvent[],
): { lines: StatementLine[]; closing: string } {
  const sorted = [...events].sort(
    (a, b) =>
      a.on.localeCompare(b.on) ||
      (a.kind === b.kind ? a.reference.localeCompare(b.reference) : a.kind === 'bill' ? -1 : 1),
  );
  let balance = Money.parse(opening);
  const lines: StatementLine[] = [];
  for (const e of sorted) {
    balance = e.kind === 'bill' ? balance.add(e.amount) : balance.sub(e.amount);
    lines.push({ ...e, balance: balance.toDbString() });
  }
  return { lines, closing: balance.toDbString() };
}
