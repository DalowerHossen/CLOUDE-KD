// path: scripts/verify/step15-expenses.ts
// Logic checks of the expense rules (15.5) that need no database: input shapes, the total, the policy checks (limits per
// expense, day and month, receipts, auto-approval, flag or block), what happens to a new expense for an owner and for staff,
// duplicate detection, the category chain, and the report tables. Category depth, the immutability of an approved expense and
// one expense per recurring date are checked in the database by sql/assertions/s15_005_expenses.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-expenses.ts
import assert from 'node:assert/strict';
import { Money } from '@/lib/utils/currency';
import { planEntry } from '@/services/accounting/posting-rules';
import {
  categoryReport,
  decideInput,
  deductibilityReport,
  employeeReport,
  evaluatePolicies,
  expenseInput,
  isDuplicate,
  outcomeOf,
  policyInput,
  recurringExpenseInput,
  summaryReport,
  totalOf,
  violationsReport,
  type ExpenseRow,
  type Policy,
  type PolicyFacts,
} from '@/services/expense/expense-rules';
import { accountOf, chainOf, type CategoryView } from '@/services/expense/categories';

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
const policy = (over: Partial<Policy> = {}): Policy => ({
  id: 'p1',
  name: 'Limit',
  categoryId: null,
  role: null,
  maxPerExpense: null,
  maxPerDay: null,
  maxPerMonth: null,
  receiptRequiredAbove: null,
  autoApproveBelow: null,
  breachAction: 'flag',
  status: 'active',
  ...over,
});
const facts = (over: Partial<PolicyFacts> = {}): PolicyFacts => ({
  total: Money.parse('100'),
  categoryChain: ['travel'],
  role: 'staff',
  hasReceipt: true,
  daySoFar: Money.zero(),
  monthSoFar: Money.zero(),
  ...over,
});
const good = { expenseDate: '2026-10-05', amountNet: '100', taxAmount: '10' };

check('expense input is strict and the total adds tax', () => {
  assert.ok(expenseInput.safeParse(good).success);
  assert.equal(totalOf('100', '10').toDbString(), '110.0000');
  assert.ok(!expenseInput.safeParse({ ...good, amountNet: '0' }).success);
  assert.ok(!expenseInput.safeParse({ ...good, amountNet: 'abc' }).success);
  assert.ok(!expenseInput.safeParse({ ...good, vendor: '<b>x</b>' }).success);
  assert.ok(!expenseInput.safeParse({ ...good, expenseDate: '2026-02-30' }).success);
  assert.ok(
    !expenseInput.safeParse({ ...good, paid: true, reimbursable: true }).success,
    'an employee-paid expense is paid back later',
  );
  assert.ok(!expenseInput.safeParse({ ...good, extra: 1 }).success);
  assert.ok(
    !expenseInput.safeParse({ ...good, paidVia: 'payroll' }).success,
    'payroll is set by payroll only',
  );
});

check('limits per expense, day and month count the money already spent', () => {
  const p = [policy({ maxPerExpense: '150', maxPerDay: '200', maxPerMonth: '1000' })];
  assert.equal(evaluatePolicies(p, facts()).violations.length, 0);
  assert.deepEqual(
    evaluatePolicies(p, facts({ total: Money.parse('151') })).violations.map((v) => v.rule),
    ['max_per_expense'],
  );
  assert.deepEqual(
    evaluatePolicies(p, facts({ daySoFar: Money.parse('150') })).violations.map((v) => v.rule),
    ['max_per_day'],
  );
  assert.deepEqual(
    evaluatePolicies(p, facts({ monthSoFar: Money.parse('950') })).violations.map((v) => v.rule),
    ['max_per_month'],
  );
});

check('a receipt is needed above the set amount', () => {
  const p = [policy({ receiptRequiredAbove: '50' })];
  assert.equal(
    evaluatePolicies(p, facts({ hasReceipt: false })).violations[0]?.rule,
    'receipt_required',
  );
  assert.equal(evaluatePolicies(p, facts({ hasReceipt: true })).violations.length, 0);
  assert.equal(
    evaluatePolicies(p, facts({ hasReceipt: false, total: Money.parse('50') })).violations.length,
    0,
    'not above the amount',
  );
});

check('a policy covers its category and the ones below it, its role, and only while active', () => {
  const p = policy({ categoryId: 'travel', role: 'staff', maxPerExpense: '10' });
  assert.equal(
    evaluatePolicies([p], facts({ categoryChain: ['flights', 'travel'] })).violations.length,
    1,
  );
  assert.equal(evaluatePolicies([p], facts({ categoryChain: ['meals'] })).violations.length, 0);
  assert.equal(evaluatePolicies([p], facts({ role: 'owner' })).violations.length, 0);
  assert.equal(evaluatePolicies([{ ...p, status: 'inactive' }], facts()).violations.length, 0);
});

check('small expenses are approved by a policy only when nothing is breached', () => {
  const p = [policy({ autoApproveBelow: '200' })];
  assert.equal(evaluatePolicies(p, facts()).autoApprove, true);
  assert.equal(evaluatePolicies(p, facts({ total: Money.parse('200') })).autoApprove, false);
  const both = [policy({ autoApproveBelow: '200', maxPerExpense: '50' })];
  assert.equal(
    evaluatePolicies(both, facts()).autoApprove,
    false,
    'a breach cancels auto-approval',
  );
});

check('what happens to a new expense', () => {
  const clean = evaluatePolicies([], facts());
  assert.deepEqual(outcomeOf('owner', clean, ''), { kind: 'approved', override: null });
  assert.deepEqual(outcomeOf('staff', clean, ''), { kind: 'pending' });
  const auto = evaluatePolicies([policy({ autoApproveBelow: '500' })], facts());
  assert.deepEqual(outcomeOf('staff', auto, ''), { kind: 'approved', override: null });
  const flagged = evaluatePolicies([policy({ maxPerExpense: '50' })], facts());
  assert.deepEqual(outcomeOf('staff', flagged, ''), { kind: 'pending' });
  assert.deepEqual(
    outcomeOf('owner', flagged, ''),
    { kind: 'pending' },
    'an owner breach waits for an override reason',
  );
  assert.deepEqual(outcomeOf('owner', flagged, 'Client dinner approved by the board'), {
    kind: 'approved',
    override: 'Client dinner approved by the board',
  });
  const blocked = evaluatePolicies(
    [policy({ maxPerExpense: '50', breachAction: 'block' })],
    facts(),
  );
  assert.equal(
    outcomeOf('staff', blocked, 'Please let me').kind,
    'refuse',
    'staff cannot go past a block',
  );
  assert.equal(outcomeOf('owner', blocked, '').kind, 'refuse');
  assert.equal(
    outcomeOf('owner', blocked, 'short').kind,
    'refuse',
    'the override reason needs 10 characters',
  );
  assert.equal(outcomeOf('owner', blocked, 'Emergency repair of the server').kind, 'approved');
});

check(
  'duplicates: same date and total with the same receipt, or the same vendor without one',
  () => {
    const a = {
      expenseDate: '2026-10-05',
      total: '110.0000',
      receiptHash: 'h'.repeat(64),
      vendor: 'Air',
    };
    assert.equal(isDuplicate(a, { ...a, vendor: 'Other' }), true);
    assert.equal(
      isDuplicate(a, { ...a, receiptHash: 'g'.repeat(64) }),
      false,
      'a different receipt is a different expense',
    );
    assert.equal(
      isDuplicate({ ...a, receiptHash: null }, { ...a, receiptHash: null, vendor: ' air ' }),
      true,
    );
    assert.equal(
      isDuplicate({ ...a, receiptHash: null, vendor: '' }, { ...a, receiptHash: null, vendor: '' }),
      false,
      'no receipt and no vendor proves nothing',
    );
    assert.equal(isDuplicate(a, { ...a, expenseDate: '2026-10-06' }), false);
    assert.equal(isDuplicate(a, { ...a, total: '110.5000' }), false);
  },
);

check('decision, policy and recurring inputs', () => {
  assert.ok(decideInput.safeParse({ decision: 'approve' }).success);
  assert.ok(!decideInput.safeParse({ decision: 'reject' }).success, 'a rejection needs a reason');
  assert.ok(decideInput.safeParse({ decision: 'reject', reason: 'Not a business cost' }).success);
  assert.ok(
    policyInput.safeParse({ name: 'Meals', maxPerExpense: '75', breachAction: 'block' }).success,
  );
  assert.ok(!policyInput.safeParse({ name: 'Meals', role: 'admin' }).success);
  assert.ok(
    recurringExpenseInput.safeParse({ name: 'Rent', amountNet: '800', firstRun: '2026-11-01' })
      .success,
  );
  assert.ok(
    !recurringExpenseInput.safeParse({
      name: 'Rent',
      amountNet: '800',
      firstRun: '2026-11-01',
      dayOfMonth: 31,
    }).success,
  );
});

check('category chain and the account a category posts to', () => {
  const cats: CategoryView[] = [
    {
      id: 'travel',
      name: 'Travel',
      parentId: null,
      accountId: 'acc-travel',
      taxDeductible: true,
      status: 'active',
      version: 1,
    },
    {
      id: 'flights',
      name: 'Flights',
      parentId: 'travel',
      accountId: null,
      taxDeductible: true,
      status: 'active',
      version: 1,
    },
    {
      id: 'meals',
      name: 'Meals',
      parentId: null,
      accountId: null,
      taxDeductible: true,
      status: 'active',
      version: 1,
    },
  ];
  assert.deepEqual(chainOf(cats, 'flights'), ['flights', 'travel']);
  assert.equal(accountOf(cats, 'flights'), 'acc-travel', 'a child uses the account above it');
  assert.equal(accountOf(cats, 'meals'), null);
  assert.equal(accountOf(cats, null), null);
});

check('an approved expense becomes the entry that accounting books', () => {
  const unpaid = planEntry(
    'expense.created',
    {
      expenseId: 'x1',
      date: '2026-10-05',
      net: '100.0000',
      tax: '10.0000',
      accountId: 'acc-travel',
      paid: false,
      memo: 'Air',
    },
    { eventId: 'e', occurredAt: '2026-10-05T10:00:00Z' },
  );
  assert.ok(unpaid.kind === 'entry');
  if (unpaid.kind === 'entry') {
    assert.deepEqual(
      unpaid.entry.lines.map((l) => `${l.side} ${l.key} ${l.amount.toDbString()}`),
      [
        'debit default_expense 100.0000',
        'debit tax_receivable 10.0000',
        'credit accounts_payable 110.0000',
      ],
    );
    assert.equal(unpaid.entry.lines[0]?.accountId, 'acc-travel');
    assert.equal(unpaid.entry.sourceKey, 'expense:x1');
  }
});

const rows: ExpenseRow[] = [
  {
    id: '1',
    date: '2026-10-01',
    categoryId: 'flights',
    submittedBy: 'u1',
    net: '100',
    tax: '10',
    total: '110',
    status: 'approved',
    taxDeductible: true,
    flags: 0,
  },
  {
    id: '2',
    date: '2026-10-09',
    categoryId: 'travel',
    submittedBy: 'u2',
    net: '50',
    tax: '0',
    total: '50',
    status: 'approved',
    taxDeductible: true,
    flags: 1,
  },
  {
    id: '3',
    date: '2026-11-02',
    categoryId: 'meals',
    submittedBy: 'u1',
    net: '80',
    tax: '8',
    total: '88',
    status: 'approved',
    taxDeductible: false,
    flags: 0,
  },
  {
    id: '4',
    date: '2026-11-03',
    categoryId: null,
    submittedBy: 'u1',
    net: '20',
    tax: '0',
    total: '20',
    status: 'approved',
    taxDeductible: true,
    flags: 0,
  },
  {
    id: '5',
    date: '2026-11-04',
    categoryId: 'meals',
    submittedBy: 'u2',
    net: '999',
    tax: '0',
    total: '999',
    status: 'pending',
    taxDeductible: true,
    flags: 0,
  },
  {
    id: '6',
    date: '2026-11-05',
    categoryId: 'meals',
    submittedBy: 'u2',
    net: '5',
    tax: '0',
    total: '5',
    status: 'rejected',
    taxDeductible: true,
    flags: 0,
  },
];

check('reports count approved expenses only', () => {
  const s = summaryReport(rows, '2026-10-01', '2026-11-30');
  assert.deepEqual(
    s.rows.map((r) => [r['month'], r['count'], r['total']]),
    [
      ['2026-10', '2', '160.0000'],
      ['2026-11', '2', '108.0000'],
    ],
  );
  assert.equal(s.totals?.['total'], '268.0000');
  assert.ok(s.notes[0]?.includes('1 expense(s), 999.0000'));
  const c = categoryReport(
    rows,
    [
      { id: 'travel', name: 'Travel', parentId: null },
      { id: 'flights', name: 'Flights', parentId: 'travel' },
      { id: 'meals', name: 'Meals', parentId: null },
    ],
    '2026-10-01',
    '2026-11-30',
  );
  assert.deepEqual(
    c.rows.map((r) => [r['name'], r['total']]),
    [
      ['Meals', '88.0000'],
      ['Travel', '160.0000'],
      ['  Flights', '110.0000'],
      ['No category', '20.0000'],
    ],
  );
  assert.equal(c.totals?.['total'], '268.0000');
  const e = employeeReport(
    rows,
    new Map([
      ['u1', 'Ana'],
      ['u2', 'Ben'],
    ]),
    '2026-10-01',
    '2026-11-30',
  );
  assert.deepEqual(
    e.rows.map((r) => [r['name'], r['count'], r['total']]),
    [
      ['Ana', '3', '218.0000'],
      ['Ben', '1', '50.0000'],
    ],
  );
  const d = deductibilityReport(rows, '2026-10-01', '2026-11-30');
  assert.equal(d.rows[0]?.['total'], '180.0000');
  assert.equal(d.rows[1]?.['tax'], '8.0000');
  assert.equal(violationsReport(rows, '2026-10-01', '2026-11-30').rows.length, 1);
});

process.stdout.write(`step15-expenses: ${checks} checks passed\n`);
