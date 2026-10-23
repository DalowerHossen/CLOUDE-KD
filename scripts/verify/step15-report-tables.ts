// path: scripts/verify/step15-report-tables.ts
// The flat tables behind the CSV, Excel and PDF exports (15.4.b): section headings, totals and checks become rows, columns
// match the rows, a name that a spreadsheet could run as a formula is neutralised in the CSV, and the same-day-last-year helper.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-report-tables.ts
import assert from 'node:assert/strict';
import { csvOf } from '@/lib/reports/csv';
import { sameDayLastYear } from '@/services/accounting/period-rules';
import {
  aging,
  balanceSheet,
  cashFlowIndirect,
  expenseTrend,
  ledgerAccount,
  profitAndLoss,
  trialBalance,
  type AccountMeta,
  type Balance,
} from '@/services/accounting/report-rules';
import { Money } from '@/lib/utils/currency';
import {
  agingTable,
  balanceSheetTable,
  cashFlowTable,
  expenseTrendTable,
  ledgerTable,
  profitLossTable,
  trialBalanceTable,
} from '@/services/accounting/report-tables';

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
const acc = (
  id: string,
  code: string,
  name: string,
  type: AccountMeta['type'],
  subtype: string,
  extra: Partial<AccountMeta> = {},
): AccountMeta => ({
  id,
  code,
  name,
  type,
  subtype,
  isContra: false,
  isCash: false,
  systemKey: null,
  ...extra,
});
const accounts = [
  acc('bank', '1110', 'Bank', 'asset', 'current_asset', { isCash: true }),
  acc('cap', '3100', 'Owner equity', 'equity', 'owner_equity'),
  acc('rev', '4100', '=Sales', 'revenue', 'operating_revenue'),
  acc('rent', '6500', 'Rent', 'expense', 'operating_expense'),
];
const bal: Balance[] = [
  { accountId: 'bank', debit: '2000', credit: '300' },
  { accountId: 'cap', debit: '0', credit: '1000' },
  { accountId: 'rev', debit: '0', credit: '1000' },
  { accountId: 'rent', debit: '300', credit: '0' },
];
const every = (t: { columns: { key: string }[]; rows: Record<string, string>[] }): boolean =>
  t.rows.every((r) => t.columns.every((c) => typeof (r[c.key] ?? '') === 'string'));

check('trial balance table has a totals row and a balanced note', () => {
  const t = trialBalanceTable({ asOf: '2026-12-31', ...trialBalance(accounts, bal) });
  assert.equal(t.rows.length, 4);
  assert.equal(t.totals?.debit, t.totals?.credit);
  assert.ok(
    t.notes.includes('As of 2026-12-31') && t.notes.some((n) => n.includes('Debits equal credits')),
  );
  assert.ok(every(t));
});

check('profit and loss table lists sections, totals and the result', () => {
  const t = profitLossTable({
    from: '2026-01-01',
    to: '2026-12-31',
    compare: null,
    ...profitAndLoss(accounts, bal),
  });
  const names = t.rows.map((r) => r['name']);
  assert.ok(
    names.includes('Revenue') && names.includes('Total revenue') && names.includes('Net income'),
  );
  assert.equal(t.rows.find((r) => r['name'] === 'Net income')?.['amount'], '700.0000');
  assert.deepEqual(
    t.columns.map((c) => c.key),
    ['code', 'name', 'amount'],
  );
  assert.ok(t.period?.from === '2026-01-01');
});

check('balance sheet table has assets, liabilities and equity blocks and the check note', () => {
  const t = balanceSheetTable({ asOf: '2026-12-31', ...balanceSheet(accounts, bal) });
  const names = t.rows.map((r) => r['name']);
  assert.ok(
    names.includes('Assets') && names.includes('Total assets') && names.includes('Total equity'),
  );
  assert.ok(t.notes.some((n) => n.includes('Assets equal liabilities plus equity')));
});

check('cash flow table ends with the cash at the start and the end', () => {
  const cf = cashFlowIndirect(accounts, [], bal, Money.parse('700'));
  const t = cashFlowTable({ from: '2026-01-01', to: '2026-12-31', ...cf });
  assert.equal(t.rows.at(-1)?.['label'], 'Cash at the end');
  assert.equal(t.rows.at(-1)?.['amount'], '1700.0000');
  assert.equal(t.rows.at(-2)?.['amount'], '0.0000');
});

check('ledger table gives each account an opening and a closing row', () => {
  const bank = accounts[0];
  assert.ok(bank);
  const l = ledgerAccount(bank, Money.zero(), [
    {
      entryId: 'e',
      date: '2026-02-01',
      number: 'JE-1',
      memo: 'm',
      description: '',
      debit: '10',
      credit: '0',
    },
  ]);
  const t = ledgerTable('general_ledger', {
    from: '2026-01-01',
    to: '2026-12-31',
    accounts: [l],
    truncated: true,
  });
  assert.deepEqual(
    t.rows.map((r) => r['memo']),
    ['Opening balance', 'm', 'Closing balance'],
  );
  assert.ok(t.notes[0]?.includes('cut'));
});

check('aging table lists the bucket totals', () => {
  const t = agingTable(
    'ar_aging',
    aging(
      [{ id: '1', party: 'A', reference: 'I-1', dueDate: '2026-12-01', amount: '50' }],
      '2026-12-31',
    ),
  );
  assert.equal(t.totals?.['amount'], '50.0000');
  assert.ok(t.notes.some((n) => n.startsWith('1 to 30 days: 50')));
  assert.equal(t.rows[0]?.['days'], '30');
});

check('expense trend table has one column per month', () => {
  const months = ['2026-01', '2026-02'];
  const tr = expenseTrend(
    accounts,
    months,
    new Map([['2026-02', [{ accountId: 'rent', debit: '5', credit: '0' }]]]),
  );
  const t = expenseTrendTable({ from: '2026-01-01', to: '2026-02-28', months, rows: tr });
  assert.deepEqual(
    t.columns.map((c) => c.label),
    ['Account', '2026-01', '2026-02', 'Total'],
  );
  assert.equal(t.rows[0]?.['m_2026-02'], '5.0000');
});

check('a name that starts with = is neutralised in the CSV', () => {
  const t = trialBalanceTable({ asOf: '2026-12-31', ...trialBalance(accounts, bal) });
  const csv = csvOf(t, ['a', 'b', 'KD-EXPORT x']);
  assert.ok(csv.includes("'=Sales"), csv);
  assert.ok(!/(^|,)=Sales/m.test(csv));
});

check('the same day one year earlier', () => {
  assert.equal(sameDayLastYear('2026-10-23'), '2025-10-23');
  assert.equal(sameDayLastYear('2028-02-29'), '2027-02-28');
  assert.equal(sameDayLastYear('2026-01-01'), '2025-01-01');
});

process.stdout.write(`step15-report-tables: ${checks} checks passed\n`);
