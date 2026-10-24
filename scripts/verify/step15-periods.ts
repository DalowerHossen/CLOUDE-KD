// path: scripts/verify/step15-periods.ts
// Logic checks of the period rules (15.3) that need no database: the fiscal year of a date for any start month, the year
// label, the closing entry (profit, loss, contra accounts), recurring dates and the checklist. A closed period refusing
// a posting, the module locks, the lock date and reopening are checked in the database by sql/assertions/s15_003_periods.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-periods.ts
import assert from 'node:assert/strict';
import { Money } from '@/lib/utils/currency';
import {
  addMonthsToDay,
  canClose,
  closeInput,
  closingLines,
  dueDates,
  fiscalYearLabel,
  fiscalYearStart,
  nextRun,
  recurringInput,
  reopenInput,
  settingsInput,
  type BalanceRow,
} from '@/services/accounting/period-rules';

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
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

check('the fiscal year of a date, for January, April and July years', () => {
  assert.equal(fiscalYearStart('2026-10-23', 1), '2026-01-01');
  assert.equal(fiscalYearStart('2026-03-31', 4), '2025-04-01');
  assert.equal(fiscalYearStart('2026-04-01', 4), '2026-04-01');
  assert.equal(fiscalYearStart('2026-06-30', 7), '2025-07-01');
  assert.equal(fiscalYearStart('2026-07-01', 7), '2026-07-01');
  assert.equal(fiscalYearStart('2026-12-31', 12), '2026-12-01');
  assert.equal(fiscalYearLabel('2026-01-01'), 'FY2026');
  assert.equal(fiscalYearLabel('2026-04-01'), 'FY2026-27');
  assert.equal(fiscalYearLabel('2099-07-01'), 'FY2099-00');
  assert.equal(addMonthsToDay('2026-04-01', 12), '2027-04-01');
  assert.equal(addMonthsToDay('2026-11-01', 3), '2027-02-01');
});

check(
  'the closing entry brings revenue and expense to zero and moves the result to retained earnings',
  () => {
    const rows: BalanceRow[] = [
      { accountId: 'rev', type: 'revenue', debit: '0', credit: '1000' },
      { accountId: 'refunds', type: 'revenue', debit: '50', credit: '0' },
      { accountId: 'rent', type: 'expense', debit: '300', credit: '0' },
      { accountId: 'wages', type: 'expense', debit: '400', credit: '0' },
      { accountId: 'bank', type: 'asset', debit: '9999', credit: '0' },
      { accountId: 'zero', type: 'expense', debit: '5', credit: '5' },
    ];
    const r = closingLines(rows, 're');
    assert.equal(r.netIncome.toDbString(), '250.0000');
    const dr = Money.sum(r.lines.map((l) => Money.parse(l.debit)));
    const cr = Money.sum(r.lines.map((l) => Money.parse(l.credit)));
    assert.ok(dr.eq(cr) && dr.isPositive(), 'balanced');
    assert.deepEqual(
      r.lines.find((l) => l.accountId === 'rev'),
      {
        accountId: 'rev',
        debit: '1000.0000',
        credit: '0',
        description: 'Close to retained earnings',
      },
    );
    assert.equal(
      r.lines.find((l) => l.accountId === 'refunds')?.credit,
      '50.0000',
      'a refunds account (contra revenue) is closed by a credit',
    );
    assert.equal(r.lines.find((l) => l.accountId === 'rent')?.credit, '300.0000');
    assert.equal(
      r.lines.find((l) => l.accountId === 're')?.credit,
      '250.0000',
      'profit is a credit to retained earnings',
    );
    assert.ok(
      !r.lines.some((l) => l.accountId === 'bank' || l.accountId === 'zero'),
      'balance sheet and zero accounts are left alone',
    );
  },
);

check('a loss is a debit to retained earnings; no activity gives no entry', () => {
  const loss = closingLines(
    [
      { accountId: 'rev', type: 'revenue', debit: '0', credit: '100' },
      { accountId: 'cost', type: 'expense', debit: '180', credit: '0' },
    ],
    're',
  );
  assert.equal(loss.netIncome.toDbString(), '-80.0000');
  assert.equal(loss.lines.find((l) => l.accountId === 're')?.debit, '80.0000');
  assert.deepEqual(closingLines([], 're'), { lines: [], netIncome: Money.zero() });
  const even = closingLines(
    [
      { accountId: 'rev', type: 'revenue', debit: '0', credit: '100' },
      { accountId: 'cost', type: 'expense', debit: '100', credit: '0' },
    ],
    're',
  );
  assert.ok(
    !even.lines.some((l) => l.accountId === 're'),
    'break even needs no retained earnings line',
  );
});

check('recurring dates stay on the same day and catch up one by one', () => {
  assert.equal(nextRun('2026-01-15', 'monthly', 15), '2026-02-15');
  assert.equal(nextRun('2026-11-01', 'quarterly', 1), '2027-02-01');
  assert.equal(nextRun('2026-03-28', 'yearly', 28), '2027-03-28');
  assert.deepEqual(dueDates('2026-08-01', '2026-10-23', 'monthly', 1, null), [
    '2026-08-01',
    '2026-09-01',
    '2026-10-01',
  ]);
  assert.deepEqual(dueDates('2026-11-01', '2026-10-23', 'monthly', 1, null), []);
  assert.deepEqual(dueDates('2026-08-01', '2026-10-23', 'monthly', 1, '2026-09-15'), [
    '2026-08-01',
    '2026-09-01',
  ]);
  assert.equal(
    dueDates('2020-01-01', '2026-10-23', 'monthly', 1, null).length,
    12,
    'at most 12 runs at a time',
  );
});

check('input shapes are strict', () => {
  assert.ok(
    settingsInput.safeParse({
      fiscalStartMonth: 4,
      closedPeriodPolicy: 'fail',
      lockDate: '2026-03-31',
    }).success,
  );
  assert.ok(settingsInput.safeParse({ lockDate: null }).success);
  assert.ok(!settingsInput.safeParse({ fiscalStartMonth: 13 }).success);
  assert.ok(!settingsInput.safeParse({ closedPeriodPolicy: 'skip' }).success);
  assert.ok(!settingsInput.safeParse({ lockDate: '2026-02-30' }).success);
  assert.ok(closeInput.safeParse({}).success);
  assert.ok(!closeInput.safeParse({ note: '<b>' }).success);
  assert.ok(reopenInput.safeParse({ reason: 'A late invoice was found' }).success);
  assert.ok(
    !reopenInput.safeParse({ reason: 'oops' }).success,
    'a reason of at least 10 characters',
  );
  const good = {
    name: 'Rent',
    firstRun: '2026-11-01',
    lines: [
      { accountId: A, debit: '500' },
      { accountId: B, credit: '500' },
    ],
  };
  assert.ok(recurringInput.safeParse(good).success);
  assert.ok(
    !recurringInput.safeParse({
      ...good,
      lines: [
        { accountId: A, debit: '500' },
        { accountId: B, credit: '400' },
      ],
    }).success,
    'must balance',
  );
  assert.ok(!recurringInput.safeParse({ ...good, dayOfMonth: 31 }).success, 'day 1 to 28');
  assert.ok(!recurringInput.safeParse({ ...good, frequency: 'weekly' }).success);
});

check('a period closes only when every checklist item is done', () => {
  assert.equal(
    canClose([
      { key: 'a', label: 'A', done: true, remaining: 0 },
      { key: 'b', label: 'B', done: true, remaining: null },
    ]),
    true,
  );
  assert.equal(
    canClose([
      { key: 'a', label: 'A', done: true, remaining: 0 },
      { key: 'b', label: 'B', done: false, remaining: 2 },
    ]),
    false,
  );
});

process.stdout.write(`step15-periods: ${checks} checks passed\n`);
