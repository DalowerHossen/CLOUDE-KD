// path: scripts/verify/step15-posting.ts
// The case table of the posting rules (15.2): for each event the expected debit and credit lines, with amounts. Pure, no
// database. That an event makes one entry only once (source key), that an unbalanced plan is refused and that the entry
// numbers follow are checked in the database by sql/assertions/s15_001 and s15_002.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-posting.ts
import assert from 'node:assert/strict';
import { BASE_CHART, MAPPING_KEYS } from '@/config/s15-accounting';
import { Money } from '@/lib/utils/currency';
import {
  POSTING_EVENTS,
  POSTING_RULES,
  planEntry,
  type EventFacts,
  type Plan,
} from '@/services/accounting/posting-rules';

let checks = 0;
const check = (name: string, fn: () => void): void => {
  try {
    fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};
const base: EventFacts = { eventId: 'e1', occurredAt: '2026-10-05T10:00:00Z' };
const shape = (p: Plan): string[] => {
  assert.equal(p.kind, 'entry');
  if (p.kind !== 'entry') return [];
  return p.entry.lines.map(
    (l) => `${l.side === 'debit' ? 'Dr' : 'Cr'} ${l.key} ${l.amount.toDbString()}`,
  );
};

check('every rule has a posting key and every key has an account in the base chart', () => {
  assert.equal(POSTING_RULES.length, POSTING_EVENTS.length);
  const keys = new Set(BASE_CHART.flatMap((c) => (c.key ? [c.key] : [])));
  for (const k of MAPPING_KEYS) assert.ok(keys.has(k), k);
});

check('invoice issued: receivable, revenue, tax', () => {
  const inv = { number: 'INV-1', issueDate: '2026-10-01', total: '110', taxTotal: '10' };
  const p = planEntry('invoice.sent', { invoiceId: 'i1' }, { ...base, invoice: inv });
  assert.deepEqual(shape(p), [
    'Dr accounts_receivable 110.0000',
    'Cr revenue 100.0000',
    'Cr tax_payable 10.0000',
  ]);
  assert.ok(
    p.kind === 'entry' && p.entry.sourceKey === 'invoice:i1:sent' && p.entry.date === '2026-10-01',
  );
  const noTax = planEntry(
    'invoice.sent',
    { invoiceId: 'i1' },
    { ...base, invoice: { ...inv, total: '50', taxTotal: '0' } },
  );
  assert.deepEqual(shape(noTax), ['Dr accounts_receivable 50.0000', 'Cr revenue 50.0000']);
  assert.equal(
    planEntry(
      'invoice.sent',
      { invoiceId: 'i1' },
      { ...base, invoice: { ...inv, total: '0', taxTotal: '0' } },
    ).kind,
    'skip',
  );
  assert.equal(planEntry('invoice.sent', { invoiceId: 'i1' }, base).kind, 'skip');
});

check('invoice voided reverses the issued entry', () => {
  const p = planEntry('invoice.voided', { invoiceId: 'i1' }, base);
  assert.deepEqual(p, {
    kind: 'reverse',
    sourceKey: 'invoice:i1:sent',
    date: '2026-10-05',
    reason: 'Invoice voided',
  });
});

check('payment received: straight to the bank, or through the wallet with fees', () => {
  const direct = planEntry(
    'payment.captured',
    { paymentId: 'p1' },
    { ...base, settlement: { mode: 'direct', gross: '100', net: '97' } },
  );
  assert.deepEqual(shape(direct), ['Dr bank 100.0000', 'Cr accounts_receivable 100.0000']);
  const mor = planEntry(
    'payment.captured',
    { paymentId: 'p1' },
    { ...base, settlement: { mode: 'mor', gross: '100', net: '96.5' } },
  );
  assert.deepEqual(shape(mor), [
    'Dr wallet_balance 96.5000',
    'Dr processor_fees 3.5000',
    'Cr accounts_receivable 100.0000',
  ]);
  const free = planEntry(
    'payment.captured',
    { paymentId: 'p1' },
    { ...base, settlement: { mode: 'suspended', gross: '40', net: '40' } },
  );
  assert.deepEqual(shape(free), ['Dr wallet_balance 40.0000', 'Cr accounts_receivable 40.0000']);
  assert.ok(mor.kind === 'entry' && mor.entry.sourceKey === 'payment:p1:captured');
});

check('refund: refunds account against the bank or the wallet', () => {
  const direct = planEntry(
    'payment.refunded',
    { paymentId: 'p1', refundId: 'r1', refundedAmount: '25' },
    { ...base, settlement: { mode: 'direct', gross: '100', net: '100' } },
  );
  assert.deepEqual(shape(direct), ['Dr refunds 25.0000', 'Cr bank 25.0000']);
  const mor = planEntry(
    'payment.refunded',
    { paymentId: 'p1', refundId: 'r1', refundedAmount: '25' },
    { ...base, settlement: { mode: 'mor', gross: '100', net: '97' } },
  );
  assert.deepEqual(shape(mor), ['Dr refunds 25.0000', 'Cr wallet_balance 25.0000']);
  assert.ok(mor.kind === 'entry' && mor.entry.sourceKey === 'refund:r1');
  assert.equal(
    planEntry(
      'payment.refunded',
      { paymentId: 'p1', refundId: 'r1' },
      { ...base, settlement: { mode: 'mor', gross: '1', net: '1' } },
    ).kind,
    'skip',
  );
});

check('payout paid: bank receives the net, the fee is an expense, the wallet is cleared', () => {
  const p = planEntry('payout.paid', { payoutId: 'o1', amount: '200', net: '198' }, base);
  assert.deepEqual(shape(p), [
    'Dr bank 198.0000',
    'Dr processor_fees 2.0000',
    'Cr wallet_balance 200.0000',
  ]);
  const free = planEntry('payout.paid', { payoutId: 'o2', amount: '200', net: '200' }, base);
  assert.deepEqual(shape(free), ['Dr bank 200.0000', 'Cr wallet_balance 200.0000']);
});

check('dispute lost: a chargeback expense', () => {
  const p = planEntry(
    'dispute.lost',
    { disputeId: 'd1', paymentId: 'p1' },
    { ...base, settlement: { mode: 'mor', gross: '100', net: '97' }, disputeAmount: '100' },
  );
  assert.deepEqual(shape(p), ['Dr chargeback_expense 100.0000', 'Cr wallet_balance 100.0000']);
  assert.equal(
    planEntry(
      'dispute.lost',
      { disputeId: 'd1' },
      { ...base, settlement: { mode: 'mor', gross: '1', net: '1' } },
    ).kind,
    'skip',
  );
});

check('expense: net and tax debit, bank or payable credit', () => {
  const unpaid = planEntry(
    'expense.created',
    { expenseId: 'x1', date: '2026-10-02', net: '80', tax: '8', memo: 'Printer' },
    base,
  );
  assert.deepEqual(shape(unpaid), [
    'Dr default_expense 80.0000',
    'Dr tax_receivable 8.0000',
    'Cr accounts_payable 88.0000',
  ]);
  assert.ok(unpaid.kind === 'entry' && unpaid.entry.date === '2026-10-02');
  const paid = planEntry(
    'expense.created',
    { expenseId: 'x2', net: '30', paid: true, accountId: 'acc-1' },
    base,
  );
  assert.deepEqual(shape(paid), ['Dr default_expense 30.0000', 'Cr bank 30.0000']);
  assert.ok(paid.kind === 'entry' && paid.entry.lines[0]?.accountId === 'acc-1');
});

check('payroll: the run is booked when approved and the net pay when paid', () => {
  const run = planEntry(
    'payroll.run_approved',
    { runId: 'r1', periodEnd: '2026-10-31', gross: '5000', employerCost: '400', net: '4200' },
    base,
  );
  assert.deepEqual(shape(run), [
    'Dr payroll_expense 5000.0000',
    'Dr payroll_tax_expense 400.0000',
    'Cr payroll_liability 5400.0000',
  ]);
  assert.ok(run.kind === 'entry' && run.entry.date === '2026-10-31');
  const paid = planEntry(
    'payroll.run_paid',
    { runId: 'r1', net: '4200', paidOn: '2026-11-01' },
    base,
  );
  assert.deepEqual(shape(paid), ['Dr payroll_liability 4200.0000', 'Cr bank 4200.0000']);
});

check('every plan balances', () => {
  const plans = [
    planEntry(
      'invoice.sent',
      { invoiceId: 'i' },
      {
        ...base,
        invoice: { number: 'N', issueDate: '2026-10-01', total: '123.4567', taxTotal: '12.3456' },
      },
    ),
    planEntry(
      'payment.captured',
      { paymentId: 'p' },
      { ...base, settlement: { mode: 'mor', gross: '99.9999', net: '95.0001' } },
    ),
    planEntry(
      'payroll.run_approved',
      { runId: 'r', gross: '1000.5', employerCost: '0.25', net: '800' },
      base,
    ),
  ];
  for (const p of plans) {
    assert.equal(p.kind, 'entry');
    if (p.kind !== 'entry') continue;
    const side = (which: 'debit' | 'credit'): Money =>
      Money.sum(p.entry.lines.filter((l) => l.side === which).map((l) => l.amount));
    const dr = side('debit');
    const cr = side('credit');
    assert.ok(dr.eq(cr));
  }
});

process.stdout.write(`step15-posting: ${checks} checks passed\n`);
