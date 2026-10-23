// path: services/accounting/posting-rules.ts
// The posting rules table: which domain event makes which journal entry. Pure functions: the service gathers the facts
// of an event (the invoice, the settlement of a payment, the expense or the pay run), and `planEntry` answers with the
// lines as transaction keys (resolved to the company's accounts by the service) or a reason to skip. The legs of every
// plan add up: total debit equals total credit (checked here and again by the database).
import type { MappingKey } from '@/config/s15-accounting';
import { Money } from '@/lib/utils/currency';

export type PostingEventName =
  | 'invoice.sent'
  | 'invoice.voided'
  | 'payment.captured'
  | 'payment.refunded'
  | 'payout.paid'
  | 'dispute.lost'
  | 'expense.created'
  | 'payroll.run_approved'
  | 'payroll.run_paid';

export interface RuleInfo {
  event: PostingEventName;
  /** What the owner sees in the review queue. */
  title: string;
  /** The lines in words, for the posting rules table in the handoff and the help text. */
  lines: string;
}

/** The posting rules table. */
export const POSTING_RULES: readonly RuleInfo[] = [
  {
    event: 'invoice.sent',
    title: 'Invoice issued',
    lines:
      'Debit accounts receivable (total); credit revenue (total less tax); credit tax payable (tax).',
  },
  {
    event: 'invoice.voided',
    title: 'Invoice voided',
    lines: 'Reverses the entry of the issued invoice.',
  },
  {
    event: 'payment.captured',
    title: 'Payment received',
    lines:
      'Direct: debit bank (gross), credit accounts receivable. Through the wallet: debit wallet balance (net), debit processing fees (fees), credit accounts receivable (gross).',
  },
  {
    event: 'payment.refunded',
    title: 'Payment refunded',
    lines: 'Debit refunds (amount); credit bank (direct) or wallet balance (through the wallet).',
  },
  {
    event: 'payout.paid',
    title: 'Payout paid',
    lines: 'Debit bank (net); debit processing fees (payout fee); credit wallet balance (amount).',
  },
  {
    event: 'dispute.lost',
    title: 'Dispute lost',
    lines:
      'Debit chargebacks and disputes (amount); credit bank (direct) or wallet balance (through the wallet).',
  },
  {
    event: 'expense.created',
    title: 'Expense recorded',
    lines:
      'Debit the expense account (net) and tax receivable (tax); credit bank when paid, otherwise accounts payable (total).',
  },
  {
    event: 'payroll.run_approved',
    title: 'Pay run approved',
    lines:
      'Debit salaries (gross); debit payroll taxes and contributions (employer cost); credit payroll liabilities (net pay, withheld tax and deductions, employer cost).',
  },
  {
    event: 'payroll.run_paid',
    title: 'Pay run paid',
    lines: 'Debit payroll liabilities (net pay); credit bank (net pay).',
  },
];

export const POSTING_EVENTS: readonly PostingEventName[] = POSTING_RULES.map((r) => r.event);

export interface PlannedLine {
  key: MappingKey;
  /** For an expense, the account of its category instead of the default expense account. */
  accountId?: string;
  side: 'debit' | 'credit';
  amount: Money;
  description: string;
}

export interface PlannedEntry {
  /** The date of the entry (YYYY-MM-DD). */
  date: string;
  memo: string;
  sourceType: string;
  sourceId: string;
  /** One entry per key. */
  sourceKey: string;
  lines: PlannedLine[];
}

export type Plan =
  | { kind: 'entry'; entry: PlannedEntry }
  | { kind: 'reverse'; sourceKey: string; date: string; reason: string }
  | { kind: 'skip'; reason: string };

/** How a captured payment was settled: straight to the company, or through the platform wallet. */
export interface SettlementFacts {
  mode: 'direct' | 'mor' | 'suspended';
  gross: string;
  net: string;
}

export interface InvoiceFacts {
  number: string;
  issueDate: string;
  total: string;
  taxTotal: string;
}

/** What the service gathered for an event. Fields that a rule does not need can be left out. */
export interface EventFacts {
  eventId: string;
  occurredAt: string;
  invoice?: InvoiceFacts;
  settlement?: SettlementFacts;
  disputeAmount?: string;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const day = (iso: string): string => iso.slice(0, 10);

function amountOf(v: unknown): Money | null {
  const t = text(v);
  if (!t) return null;
  try {
    return Money.parse(t);
  } catch {
    return null;
  }
}

const line = (
  key: MappingKey,
  side: 'debit' | 'credit',
  amount: Money,
  description: string,
  accountId?: string,
): PlannedLine => ({
  key,
  side,
  amount,
  description,
  ...(accountId ? { accountId } : {}),
});

/** Lines with a zero amount are left out; the rest must balance. */
function entry(base: Omit<PlannedEntry, 'lines'>, lines: PlannedLine[]): Plan {
  const used = lines.filter((l) => l.amount.isPositive());
  const debit = Money.sum(used.filter((l) => l.side === 'debit').map((l) => l.amount));
  const credit = Money.sum(used.filter((l) => l.side === 'credit').map((l) => l.amount));
  if (used.length < 2 || !debit.eq(credit) || !debit.isPositive()) {
    return {
      kind: 'skip',
      reason: `The amounts do not balance (debit ${debit.toDbString()}, credit ${credit.toDbString()}).`,
    };
  }
  return { kind: 'entry', entry: { ...base, lines: used } };
}

const holder = (s: SettlementFacts): MappingKey =>
  s.mode === 'direct' ? 'bank' : 'wallet_balance';

/** The plan for one event. Payload names follow the events of the STEPs that publish them. */
export function planEntry(
  name: PostingEventName,
  payload: Record<string, unknown>,
  facts: EventFacts,
): Plan {
  const date = day(facts.occurredAt);
  switch (name) {
    case 'invoice.sent': {
      const inv = facts.invoice;
      const id = text(payload.invoiceId);
      if (!inv || !id) return { kind: 'skip', reason: 'The invoice was not found.' };
      const total = Money.parse(inv.total);
      const tax = Money.parse(inv.taxTotal);
      if (!total.isPositive()) return { kind: 'skip', reason: 'An invoice of zero is not posted.' };
      const revenue = total.sub(tax);
      return entry(
        {
          date: inv.issueDate,
          memo: `Invoice ${inv.number}`,
          sourceType: 'invoice',
          sourceId: id,
          sourceKey: `invoice:${id}:sent`,
        },
        [
          line('accounts_receivable', 'debit', total, `Invoice ${inv.number}`),
          line('revenue', 'credit', revenue, `Invoice ${inv.number}`),
          line('tax_payable', 'credit', tax, `Tax on invoice ${inv.number}`),
        ],
      );
    }
    case 'invoice.voided': {
      const id = text(payload.invoiceId);
      if (!id) return { kind: 'skip', reason: 'The event has no invoice.' };
      return { kind: 'reverse', sourceKey: `invoice:${id}:sent`, date, reason: 'Invoice voided' };
    }
    case 'payment.captured': {
      const s = facts.settlement;
      const id = text(payload.paymentId);
      if (!s || !id) return { kind: 'skip', reason: 'The payment was not found.' };
      const gross = Money.parse(s.gross);
      const net = Money.parse(s.net);
      const memo = 'Payment received';
      const base = {
        date,
        memo,
        sourceType: 'payment',
        sourceId: id,
        sourceKey: `payment:${id}:captured`,
      };
      if (s.mode === 'direct') {
        return entry(base, [
          line('bank', 'debit', gross, memo),
          line('accounts_receivable', 'credit', gross, memo),
        ]);
      }
      return entry(base, [
        line('wallet_balance', 'debit', net, memo),
        line('processor_fees', 'debit', gross.sub(net), 'Fees on the payment'),
        line('accounts_receivable', 'credit', gross, memo),
      ]);
    }
    case 'payment.refunded': {
      const s = facts.settlement;
      const refundId = text(payload.refundId);
      const amount = amountOf(payload.refundedAmount);
      if (!s || !refundId || !amount)
        return { kind: 'skip', reason: 'The refund has no amount or the payment was not found.' };
      return entry(
        {
          date,
          memo: 'Refund',
          sourceType: 'refund',
          sourceId: refundId,
          sourceKey: `refund:${refundId}`,
        },
        [
          line('refunds', 'debit', amount, 'Refund'),
          line(holder(s), 'credit', amount, 'Refund paid'),
        ],
      );
    }
    case 'payout.paid': {
      const id = text(payload.payoutId);
      const amount = amountOf(payload.amount);
      const net = amountOf(payload.net);
      if (!id || !amount || !net) return { kind: 'skip', reason: 'The payout has no amounts.' };
      return entry(
        {
          date,
          memo: 'Payout from the wallet',
          sourceType: 'payout',
          sourceId: id,
          sourceKey: `payout:${id}:paid`,
        },
        [
          line('bank', 'debit', net, 'Payout received'),
          line('processor_fees', 'debit', amount.sub(net), 'Payout fee'),
          line('wallet_balance', 'credit', amount, 'Payout from the wallet'),
        ],
      );
    }
    case 'dispute.lost': {
      const s = facts.settlement;
      const id = text(payload.disputeId) ?? facts.eventId;
      const amount = facts.disputeAmount ? amountOf(facts.disputeAmount) : null;
      if (!s || !amount)
        return { kind: 'skip', reason: 'The dispute amount or the payment was not found.' };
      return entry(
        {
          date,
          memo: 'Dispute lost',
          sourceType: 'dispute',
          sourceId: id,
          sourceKey: `dispute:${id}:lost`,
        },
        [
          line('chargeback_expense', 'debit', amount, 'Dispute lost'),
          line(holder(s), 'credit', amount, 'Dispute lost'),
        ],
      );
    }
    case 'expense.created': {
      // Payload of the expense service (15.5): expenseId, date, net, tax, accountId (the category account or absent), paid.
      const id = text(payload.expenseId);
      const net = amountOf(payload.net);
      const tax = amountOf(payload.tax) ?? Money.zero();
      if (!id || !net) return { kind: 'skip', reason: 'The expense has no amount.' };
      const accountId = text(payload.accountId) ?? undefined;
      const paid = payload.paid === true;
      const memo = text(payload.memo) ?? 'Expense';
      return entry(
        {
          date: text(payload.date) ?? date,
          memo,
          sourceType: 'expense',
          sourceId: id,
          sourceKey: `expense:${id}`,
        },
        [
          line('default_expense', 'debit', net, memo, accountId),
          line('tax_receivable', 'debit', tax, `Tax on ${memo}`),
          line(paid ? 'bank' : 'accounts_payable', 'credit', net.add(tax), memo),
        ],
      );
    }
    case 'payroll.run_approved': {
      // Payload of the pay run service (15.8): runId, periodEnd, gross, employerCost, net.
      const id = text(payload.runId);
      const gross = amountOf(payload.gross);
      const employer = amountOf(payload.employerCost) ?? Money.zero();
      const net = amountOf(payload.net);
      if (!id || !gross || !net) return { kind: 'skip', reason: 'The pay run has no amounts.' };
      // Everything that is owed after the run: net pay, tax and deductions withheld from the employees, employer cost.
      const owed = gross.add(employer);
      return entry(
        {
          date: text(payload.periodEnd) ?? date,
          memo: 'Payroll',
          sourceType: 'pay_run',
          sourceId: id,
          sourceKey: `payroll:${id}:approved`,
        },
        [
          line('payroll_expense', 'debit', gross, 'Gross pay'),
          line('payroll_tax_expense', 'debit', employer, 'Employer taxes and contributions'),
          line('payroll_liability', 'credit', owed, 'Payroll owed'),
        ],
      );
    }
    case 'payroll.run_paid': {
      const id = text(payload.runId);
      const net = amountOf(payload.net);
      if (!id || !net) return { kind: 'skip', reason: 'The pay run has no net amount.' };
      return entry(
        {
          date: text(payload.paidOn) ?? date,
          memo: 'Payroll paid',
          sourceType: 'pay_run',
          sourceId: id,
          sourceKey: `payroll:${id}:paid`,
        },
        [
          line('payroll_liability', 'debit', net, 'Net pay'),
          line('bank', 'credit', net, 'Net pay paid'),
        ],
      );
    }
    default:
      return { kind: 'skip', reason: 'No posting rule for this event.' };
  }
}
