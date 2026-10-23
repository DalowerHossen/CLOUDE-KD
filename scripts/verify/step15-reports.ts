// path: scripts/verify/step15-reports.ts
// A seeded ledger and the expected figures of every report (15.4.a). Pure, no database: the sums per account are built from
// the entries below with the same rules as the SQL function. The sums themselves (posted only, date range, closing entries,
// company isolation) are checked in the database by sql/assertions/s15_004_report_views.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-reports.ts
import assert from 'node:assert/strict';
import { Money } from '@/lib/utils/currency';
import {
  aging,
  balanceSheet,
  bucketOf,
  cashBalances,
  cashFlowIndirect,
  daysOverdue,
  expenseSummary,
  expenseTrend,
  ledgerAccount,
  monthlyTrend,
  monthsBetween,
  profitAndLoss,
  ratio,
  ratios,
  taxSummary,
  trialBalance,
  withComparison,
  type AccountMeta,
  type Balance,
} from '@/services/accounting/report-rules';

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
const accounts: AccountMeta[] = [
  acc('bank', '1110', 'Bank', 'asset', 'current_asset', { isCash: true, systemKey: 'bank' }),
  acc('ar', '1130', 'Accounts receivable', 'asset', 'current_asset', {
    systemKey: 'accounts_receivable',
  }),
  acc('eq', '1210', 'Equipment', 'asset', 'fixed_asset'),
  acc('dep', '1290', 'Accumulated depreciation', 'asset', 'fixed_asset', {
    isContra: true,
    systemKey: 'accumulated_depreciation',
  }),
  acc('ap', '2110', 'Accounts payable', 'liability', 'current_liability'),
  acc('tax', '2120', 'Tax payable', 'liability', 'current_liability', { systemKey: 'tax_payable' }),
  acc('loan', '2510', 'Loans', 'liability', 'long_term_liability'),
  acc('cap', '3100', 'Owner equity', 'equity', 'owner_equity'),
  acc('re', '3200', 'Retained earnings', 'equity', 'retained_earnings'),
  acc('rev', '4100', 'Sales revenue', 'revenue', 'operating_revenue'),
  acc('rent', '6500', 'Rent', 'expense', 'operating_expense'),
  acc('depx', '6300', 'Depreciation expense', 'expense', 'operating_expense'),
];
interface Entry {
  date: string;
  closing?: boolean;
  lines: [string, string, string][];
}
const OPENING: Entry = {
  date: '2026-09-01',
  lines: [
    ['bank', '10000', '0'],
    ['cap', '0', '10000'],
  ],
};
const PERIOD: Entry[] = [
  {
    date: '2026-10-05',
    lines: [
      ['ar', '1100', '0'],
      ['rev', '0', '1000'],
      ['tax', '0', '100'],
    ],
  },
  {
    date: '2026-10-20',
    lines: [
      ['bank', '600', '0'],
      ['ar', '0', '600'],
    ],
  },
  {
    date: '2026-11-03',
    lines: [
      ['rent', '300', '0'],
      ['bank', '0', '300'],
    ],
  },
  {
    date: '2026-11-10',
    lines: [
      ['eq', '2000', '0'],
      ['bank', '0', '2000'],
    ],
  },
  {
    date: '2026-12-31',
    lines: [
      ['depx', '100', '0'],
      ['dep', '0', '100'],
    ],
  },
  {
    date: '2026-12-01',
    lines: [
      ['bank', '500', '0'],
      ['loan', '0', '500'],
    ],
  },
  {
    date: '2026-12-15',
    lines: [
      ['rent', '200', '0'],
      ['ap', '0', '200'],
    ],
  },
];
const CLOSING: Entry = {
  date: '2026-12-31',
  closing: true,
  lines: [
    ['rev', '1000', '0'],
    ['rent', '0', '500'],
    ['depx', '0', '100'],
    ['re', '0', '400'],
  ],
};

/** The sums per account of the entries, as the SQL function gives them. */
function sums(
  entries: Entry[],
  from: string | null,
  to: string | null,
  closing: boolean,
): Balance[] {
  const t = new Map<string, [Money, Money]>();
  for (const e of entries) {
    if ((from && e.date < from) || (to && e.date > to) || (e.closing && !closing)) continue;
    for (const [id, d, c] of e.lines) {
      const cur = t.get(id) ?? [Money.zero(), Money.zero()];
      t.set(id, [cur[0].add(d), cur[1].add(c)]);
    }
  }
  return [...t.entries()].map(([accountId, [d, c]]) => ({
    accountId,
    debit: d.toDbString(),
    credit: c.toDbString(),
  }));
}
const lineOf = (
  s: { lines: { accountId: string; amount: string }[] }[],
  id: string,
): string | undefined => s.flatMap((x) => x.lines).find((l) => l.accountId === id)?.amount;

for (const withClosing of [false, true]) {
  const all = withClosing ? [OPENING, ...PERIOD, CLOSING] : [OPENING, ...PERIOD];
  const label = withClosing ? ' (after the year-end closing entry)' : '';

  check(`trial balance adds up${label}`, () => {
    const tb = trialBalance(accounts, sums(all, null, '2026-12-31', true));
    assert.ok(tb.balanced);
    assert.equal(tb.totalDebit, tb.totalCredit);
    if (!withClosing) {
      assert.equal(tb.totalDebit, '11900.0000');
      assert.equal(
        tb.rows.find((r) => r.accountId === 'dep')?.credit,
        '100.0000',
        'a contra asset shows in the credit column',
      );
      assert.equal(tb.rows.find((r) => r.accountId === 'bank')?.debit, '8800.0000');
    }
  });

  check(`profit and loss of the quarter leaves the closing entry out${label}`, () => {
    const pl = profitAndLoss(accounts, sums(all, '2026-10-01', '2026-12-31', false));
    assert.equal(pl.revenue, '1000.0000');
    assert.equal(pl.operatingExpenses, '600.0000');
    assert.equal(pl.grossProfit, '1000.0000');
    assert.equal(pl.netIncome, '400.0000');
    assert.equal(pl.netMarginPercent, '40.00');
    assert.equal(lineOf(pl.sections, 'rent'), '500.0000');
  });

  check(
    `balance sheet balances and shows current earnings only until the year is closed${label}`,
    () => {
      const bs = balanceSheet(accounts, sums(all, null, '2026-12-31', true));
      assert.ok(bs.balanced, `difference ${bs.difference}`);
      assert.equal(bs.totalAssets, '11200.0000');
      assert.equal(bs.totalLiabilities, '800.0000');
      assert.equal(bs.totalEquity, '10400.0000');
      assert.equal(bs.currentEarnings, withClosing ? '0.0000' : '400.0000');
      assert.equal(bs.assets[1]?.total, '1900.0000', 'fixed assets net of depreciation');
    },
  );

  check(`cash flow ties out to the change in cash${label}`, () => {
    const cf = cashFlowIndirect(
      accounts,
      sums(all, null, '2026-09-30', true),
      sums(all, null, '2026-12-31', true),
      Money.parse('400'),
    );
    assert.equal(cf.openingCash, '10000.0000');
    assert.equal(cf.closingCash, '8800.0000');
    assert.equal(cf.operatingTotal, '300.0000');
    assert.equal(cf.investingTotal, '-2000.0000');
    assert.equal(cf.financingTotal, '500.0000');
    assert.equal(cf.netChange, '-1200.0000');
    assert.ok(cf.reconciled, `difference ${cf.difference}`);
    assert.ok(
      cf.operating.some(
        (l) => l.label === 'Depreciation and amortization' && l.amount === '100.0000',
      ),
    );
    assert.ok(
      cf.operating.some(
        (l) => l.label === 'Change in accounts receivable' && l.amount === '-500.0000',
      ),
    );
  });
}

check(
  'a direct movement in retained earnings shows as other equity movements and the statement still ties',
  () => {
    const dividend: Entry = {
      date: '2026-12-20',
      lines: [
        ['re', '300', '0'],
        ['bank', '0', '300'],
      ],
    };
    const open = sums([OPENING, ...PERIOD, CLOSING], null, '2026-09-30', true);
    const close = sums([OPENING, ...PERIOD, CLOSING, dividend], null, '2026-12-31', true);
    const cf = cashFlowIndirect(accounts, open, close, Money.parse('400'));
    assert.ok(
      cf.financing.some((l) => l.label === 'Other equity movements' && l.amount === '-300.0000'),
    );
    assert.ok(cf.reconciled);
  },
);

check(
  'profit and loss comparison shows the change and a line that exists in one period only',
  () => {
    const cur = profitAndLoss(
      accounts,
      sums([OPENING, ...PERIOD], '2026-10-01', '2026-12-31', false),
    );
    const prev = profitAndLoss(
      accounts,
      sums(
        [
          {
            date: '2026-07-10',
            lines: [
              ['rev', '0', '800'],
              ['bank', '800', '0'],
            ],
          },
          {
            date: '2026-08-01',
            lines: [
              ['depx', '50', '0'],
              ['dep', '0', '50'],
            ],
          },
        ],
        '2026-07-01',
        '2026-09-30',
        false,
      ),
    );
    const sections = withComparison(cur.sections, prev.sections);
    const rev = sections[0]?.lines.find((l) => l.accountId === 'rev');
    assert.equal(rev?.previous, '800.0000');
    assert.equal(rev?.change, '200.0000');
    assert.equal(rev?.changePercent, '25.00');
    const dep = sections[2]?.lines.find((l) => l.accountId === 'depx');
    assert.equal(dep?.change, '50.0000');
    assert.equal(ratio(Money.parse('5'), Money.zero()), null);
  },
);

check('the monthly trend and the months between two dates', () => {
  assert.deepEqual(monthsBetween('2026-10', '2027-01'), [
    '2026-10',
    '2026-11',
    '2026-12',
    '2027-01',
  ]);
  const by = new Map<string, Balance[]>([
    ['2026-10', sums(PERIOD, '2026-10-01', '2026-10-31', false)],
    ['2026-11', sums(PERIOD, '2026-11-01', '2026-11-30', false)],
  ]);
  const t = monthlyTrend(accounts, ['2026-10', '2026-11', '2026-12'], by);
  assert.deepEqual(
    t.map((x) => [x.month, x.revenue, x.expenses, x.netIncome]),
    [
      ['2026-10', '1000.0000', '0.0000', '1000.0000'],
      ['2026-11', '0.0000', '300.0000', '-300.0000'],
      ['2026-12', '0.0000', '0.0000', '0.0000'],
    ],
  );
});

check(
  'general ledger and account register carry a running balance in the natural direction',
  () => {
    const bank = accounts[0];
    assert.ok(bank);
    const lines = [
      {
        entryId: '2',
        date: '2026-10-20',
        number: 'JE-2',
        memo: 'Payment',
        description: '',
        debit: '600',
        credit: '0',
      },
      {
        entryId: '3',
        date: '2026-11-03',
        number: 'JE-3',
        memo: 'Rent',
        description: '',
        debit: '0',
        credit: '300',
      },
      {
        entryId: '1',
        date: '2026-10-05',
        number: 'JE-1',
        memo: 'First',
        description: '',
        debit: '100',
        credit: '0',
      },
    ];
    const l = ledgerAccount(bank, Money.parse('10000'), lines);
    assert.deepEqual(
      l.rows.map((r) => r.balance),
      ['10100.0000', '10700.0000', '10400.0000'],
    );
    assert.equal(l.closing, '10400.0000');
    assert.equal(l.totalDebit, '700.0000');
    const dep = accounts[3];
    assert.ok(dep);
    const d = ledgerAccount(dep, Money.zero(), [
      {
        entryId: '5',
        date: '2026-12-31',
        number: 'JE-5',
        memo: '',
        description: '',
        debit: '0',
        credit: '100',
      },
    ]);
    assert.equal(d.closing, '100.0000', 'a contra asset grows with credits');
  },
);

check('aging buckets by days past due', () => {
  assert.equal(daysOverdue('2026-12-15', '2026-12-31'), 16);
  assert.deepEqual([0, -5, 1, 30, 31, 60, 61, 90, 91, 120, 121].map(bucketOf), [
    'current',
    'current',
    'days_1_30',
    'days_1_30',
    'days_31_60',
    'days_31_60',
    'days_61_90',
    'days_61_90',
    'days_91_120',
    'days_91_120',
    'days_over_120',
  ]);
  const a = aging(
    [
      { id: '1', party: 'A', reference: 'INV-1', dueDate: '2026-12-15', amount: '100' },
      { id: '2', party: 'B', reference: 'INV-2', dueDate: '2026-10-01', amount: '200' },
      { id: '3', party: 'C', reference: 'INV-3', dueDate: '2026-12-31', amount: '50' },
      { id: '4', party: 'D', reference: 'INV-4', dueDate: '2026-06-01', amount: '400' },
      { id: '5', party: 'E', reference: 'INV-5', dueDate: '2026-06-01', amount: '0' },
    ],
    '2026-12-31',
  );
  assert.deepEqual(a.totals, {
    current: '50.0000',
    days_1_30: '100.0000',
    days_31_60: '0.0000',
    days_61_90: '0.0000',
    days_91_120: '200.0000',
    days_over_120: '400.0000',
  });
  assert.equal(a.total, '750.0000');
  assert.equal(a.rows.length, 4, 'a zero amount is left out');
  assert.equal(a.rows[0]?.party, 'D', 'oldest first');
});

check('cash balances, tax summary, ratios and expense reports', () => {
  const closing = sums([OPENING, ...PERIOD], null, '2026-12-31', true);
  assert.deepEqual(cashBalances(accounts, closing), {
    rows: [{ accountId: 'bank', code: '1110', name: 'Bank', balance: '8800.0000' }],
    total: '8800.0000',
  });
  const t = taxSummary(accounts, sums(PERIOD, '2026-10-01', '2026-12-31', false));
  assert.equal(t.collected, '100.0000');
  assert.equal(t.paidOnPurchases, '0.0000');
  assert.equal(t.netPayable, '100.0000');
  const bs = balanceSheet(accounts, closing);
  const pl = profitAndLoss(accounts, sums(PERIOD, '2026-10-01', '2026-12-31', false));
  const r = ratios(accounts, bs, pl, closing);
  assert.deepEqual(r, {
    currentRatio: '31.00',
    quickRatio: '31.00',
    debtToEquity: '0.08',
    workingCapital: '9000.0000',
    grossMarginPercent: '100.00',
    netMarginPercent: '40.00',
    returnOnEquityPercent: '3.85',
  });
  const ex = expenseSummary(accounts, sums(PERIOD, '2026-10-01', '2026-12-31', false));
  assert.equal(ex.total, '600.0000');
  assert.deepEqual(
    ex.rows.map((x) => [x.code, x.amount, x.sharePercent]),
    [
      ['6500', '500.0000', '83.33'],
      ['6300', '100.0000', '16.67'],
    ],
  );
  const months = ['2026-10', '2026-11', '2026-12'];
  const trend = expenseTrend(
    accounts,
    months,
    new Map(months.map((m) => [m, sums(PERIOD, `${m}-01`, `${m}-31`, false)])),
  );
  assert.deepEqual(
    trend.map((x) => [x.code, x.months, x.total]),
    [
      ['6300', ['0.0000', '0.0000', '100.0000'], '100.0000'],
      ['6500', ['0.0000', '300.0000', '200.0000'], '500.0000'],
    ],
  );
  assert.equal(
    ratios(accounts, balanceSheet(accounts, []), profitAndLoss(accounts, []), []).currentRatio,
    null,
    'no division by zero',
  );
});

process.stdout.write(`step15-reports: ${checks} checks passed\n`);
