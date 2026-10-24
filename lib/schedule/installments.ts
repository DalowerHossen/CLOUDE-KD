// path: lib/schedule/installments.ts
// Installment plans: splitting an invoice into parts and telling which parts are paid. Payments are not matched to
// parts one by one; the parts are paid in date order from the money paid so far (the first part first). Pure.
import { occurrenceDate, type RecurrenceUnit } from './recurrence';
import { Money } from '@/lib/utils/currency';

export interface InstallmentRow {
  number: number;
  dueDate: string;
  amount: string;
}

export interface SplitInput {
  total: string;
  count: number;
  firstDue: string;
  unit: RecurrenceUnit;
  every: number;
  /** A share (percent) paid with the first installment; 0 for none. */
  downPaymentPercent: string;
}

/**
 * Equal parts that add up to the total exactly: the last part takes the rounding rest. With a down payment the first
 * part is that share and the others split the rest.
 */
export function splitInstallments(input: SplitInput): InstallmentRow[] {
  const total = Money.parse(input.total);
  const down = Money.parse(input.downPaymentPercent).isZero()
    ? Money.zero()
    : total.percent(input.downPaymentPercent);
  const rest = total.sub(down);
  const equalCount = down.isZero() ? input.count : input.count - 1;
  const each = equalCount > 0 ? rest.div(String(equalCount)) : Money.zero();
  const recurrence = {
    unit: input.unit,
    every: input.every,
    monthEnd: false,
    startDate: input.firstDue,
  };
  const amounts: Money[] = [];
  if (!down.isZero()) amounts.push(down);
  for (let i = 0; i < equalCount; i += 1) amounts.push(each);
  const sum = amounts.reduce((s, a) => s.add(a), Money.zero());
  const last = amounts.length - 1;
  const lastAmount = amounts[last];
  if (lastAmount) amounts[last] = lastAmount.add(total.sub(sum));
  return amounts.map((amount, i) => ({
    number: i + 1,
    dueDate: occurrenceDate(recurrence, i),
    amount: amount.toDbString(),
  }));
}

export type InstallmentState = 'paid' | 'partial' | 'overdue' | 'pending';

export interface InstallmentStatus extends InstallmentRow {
  state: InstallmentState;
  /** How much of this part is still unpaid. */
  outstanding: string;
}

export function installmentStatuses(
  rows: readonly InstallmentRow[],
  amountPaid: string,
  today: string,
): InstallmentStatus[] {
  let remaining = Money.parse(amountPaid);
  return [...rows]
    .sort((a, b) => a.number - b.number)
    .map((row) => {
      const amount = Money.parse(row.amount);
      const covered = Money.min(remaining, amount);
      remaining = remaining.sub(covered);
      const outstanding = amount.sub(covered);
      const state: InstallmentState = outstanding.isZero()
        ? 'paid'
        : row.dueDate < today
          ? 'overdue'
          : covered.isPositive()
            ? 'partial'
            : 'pending';
      return { ...row, state, outstanding: outstanding.toDbString() };
    });
}

/** Problems with a plan typed by hand, or an empty list when it is fine. */
export function planProblems(
  rows: readonly InstallmentRow[],
  total: string,
  issueDate: string,
): string[] {
  const problems: string[] = [];
  if (rows.length < 2) problems.push('A plan needs at least two installments.');
  if (rows.length > 60) problems.push('A plan can have 60 installments at most.');
  const sum = rows.reduce((s, r) => s.add(r.amount), Money.zero());
  if (!sum.eq(Money.parse(total)))
    problems.push(
      `The installments add up to ${sum.toDbString()}, not ${Money.parse(total).toDbString()}.`,
    );
  rows.forEach((r, i) => {
    if (!Money.parse(r.amount).isPositive())
      problems.push(`Installment ${i + 1} must be above zero.`);
    if (r.dueDate < issueDate)
      problems.push(`Installment ${i + 1} is due before the invoice date.`);
    const prev = rows[i - 1];
    if (prev && r.dueDate < prev.dueDate)
      problems.push(`Installment ${i + 1} is due before the one before it.`);
  });
  return problems;
}
