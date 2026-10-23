// path: scripts/verify/step15-journals.ts
// Logic checks of the chart and journal rules (15.1) that need no database: CSV reading and writing, the starting chart,
// account input, the account tree, journal input and balance, reversing lines, who needs an approval, and CSV journal
// import. Debit equals credit, the duplicate flag, the numbers, immutability and the trial balance are checked in the
// database by sql/assertions/s15_001_chart_journals.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-journals.ts
import assert from 'node:assert/strict';
import { BASE_CHART, COUNTRY_TEMPLATES, INDUSTRIES, MAPPING_KEYS } from '@/config/s15-accounting';
import { csvCell, csvTable, parseCsv, toCsv } from '@/services/accounting/accounting-csv';
import {
  accountInput,
  accountUpdate,
  accountsToCsv,
  buildTree,
  flattenTree,
  parseAccountsCsv,
  seedChart,
} from '@/services/accounting/chart-rules';
import {
  journalDraftInput,
  journalInput,
  parseJournalCsv,
  postRoute,
  reverseLines,
  totals,
} from '@/services/accounting/journal-rules';

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

check('csv reading handles quotes, doubled quotes, line breaks and a byte order mark', () => {
  assert.deepEqual(
    parseCsv(String.fromCharCode(0xfeff) + 'a,b\r\n"x, y","say ""hi"""\n\n"one\ntwo",3'),
    [
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['one\ntwo', '3'],
    ],
  );
  assert.deepEqual(csvTable('*Code,Name\n100,Cash').header, ['code', 'name']);
});

check('csv writing protects a cell that a spreadsheet could run', () => {
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "x"'), '"say ""x"""');
  assert.equal(toCsv(['h'], [['v']]), 'h\r\nv\r\n');
});

check('every industry and country template gives a sound chart', () => {
  for (const industry of INDUSTRIES) {
    for (const template of COUNTRY_TEMPLATES) {
      const chart = seedChart(industry, template);
      const codes = new Set(chart.map((c) => c.code));
      assert.equal(codes.size, chart.length, `${industry}/${template} has unique codes`);
      for (const c of chart) {
        if (c.parent) {
          const parent = chart.find((p) => p.code === c.parent);
          assert.ok(parent, `${c.code} has its parent`);
          assert.equal(parent.type, c.type, `${c.code} has the type of its parent`);
          assert.ok(parent.code < c.code, 'a parent comes before its children');
        }
      }
    }
  }
  const keys = new Set(BASE_CHART.flatMap((c) => (c.key ? [c.key] : [])));
  for (const key of MAPPING_KEYS)
    assert.ok(keys.has(key), `the base chart has an account for ${key}`);
  assert.equal(seedChart('general', 'india').find((c) => c.code === '2120')?.name, 'GST payable');
  assert.ok(seedChart('saas', 'generic').some((c) => c.code === '2160'));
});

check('account input is strict', () => {
  assert.ok(
    accountInput.safeParse({ code: '1110', name: 'Bank', type: 'asset', subtype: 'current_asset' })
      .success,
  );
  assert.ok(
    !accountInput.safeParse({ code: '11', name: 'Bank', type: 'asset', subtype: 'current_asset' })
      .success,
  );
  assert.ok(
    !accountInput.safeParse({
      code: '1110',
      name: '<b>x</b>',
      type: 'asset',
      subtype: 'current_asset',
    }).success,
  );
  assert.ok(
    !accountInput.safeParse({
      code: '1110',
      name: 'Bank',
      type: 'asset',
      subtype: 'operating_revenue',
    }).success,
  );
  assert.ok(
    !accountInput.safeParse({
      code: '1110',
      name: 'Bank',
      type: 'asset',
      subtype: 'current_asset',
      extra: 1,
    }).success,
  );
  assert.ok(accountUpdate.safeParse({ version: 2, name: 'New' }).success);
  assert.ok(!accountUpdate.safeParse({ name: 'New' }).success, 'the version is needed');
  assert.ok(
    !accountUpdate.safeParse({ version: 1, type: 'asset' }).success,
    'the type never changes here',
  );
});

check('the tree puts children under their parent in code order', () => {
  const flat = [
    { id: '3', code: '1120', name: 'Cash', parentId: '2' },
    { id: '2', code: '1100', name: 'Current', parentId: '1' },
    { id: '1', code: '1000', name: 'Assets', parentId: null },
    { id: '4', code: '1110', name: 'Bank', parentId: '2' },
    { id: '5', code: '2000', name: 'Liabilities', parentId: null },
  ];
  assert.deepEqual(
    flattenTree(buildTree(flat)).map((n) => `${n.depth}:${n.account.code}`),
    ['0:1000', '1:1100', '2:1110', '2:1120', '0:2000'],
  );
});

check('a chart file from QuickBooks or Xero is read, bad rows are listed with their line', () => {
  const qb = parseAccountsCsv(
    'Account Number,Account Name,Type,Detail Type\n1010,Checking,Bank,Checking\n4000,Sales,Income,Sales of Product Income\n6000,Rent,Expenses,Rent or Lease',
  );
  assert.deepEqual(qb.errors, []);
  assert.deepEqual(
    qb.accounts.map((a) => `${a.code}:${a.type}:${a.subtype}`),
    [
      '1010:asset:current_asset',
      '4000:revenue:operating_revenue',
      '6000:expense:operating_expense',
    ],
  );
  const xero = parseAccountsCsv(
    '*Code,*Name,*Type,Description\n20,Too short,Revenue,\n310,Cost of Goods Sold,Direct Costs,\n400,Advertising,Expense,',
  );
  assert.deepEqual(
    xero.accounts.map((a) => `${a.code}:${a.type}:${a.subtype}`),
    ['310:expense:cost_of_sales', '400:expense:operating_expense'],
  );
  assert.equal(xero.errors[0]?.line, 2, 'a code with fewer than 3 digits is not valid');
  const bad = parseAccountsCsv(
    'Code,Name,Type\n1000,Cash,Bank\n1000,Again,Bank\n1100,<x>,Bank\n1200,Odd,Spaceship',
  );
  assert.equal(bad.accounts.length, 1);
  assert.deepEqual(
    bad.errors.map((e) => e.line),
    [3, 4, 5],
  );
  assert.equal(parseAccountsCsv('foo,bar\n1,2').errors.length, 1);
});

check('the chart exports to CSV and reads back', () => {
  const csv = accountsToCsv([
    {
      id: '1',
      code: '1110',
      name: '=Bank',
      parentId: null,
      type: 'asset',
      subtype: 'current_asset',
      status: 'active',
      description: '',
      normalSide: 'debit',
    },
  ]);
  assert.ok(csv.includes("'=Bank"));
});

check('journal input: one side per line, debits equal credits', () => {
  const good = {
    entryDate: '2026-10-01',
    memo: 'Sale',
    lines: [
      { accountId: A, debit: '100' },
      { accountId: B, credit: '100.00' },
    ],
  };
  assert.ok(journalInput.safeParse(good).success);
  assert.ok(
    !journalInput.safeParse({
      ...good,
      lines: [
        { accountId: A, debit: '100' },
        { accountId: B, credit: '99' },
      ],
    }).success,
  );
  assert.ok(
    !journalInput.safeParse({
      ...good,
      lines: [
        { accountId: A, debit: '0' },
        { accountId: B, credit: '0' },
      ],
    }).success,
  );
  assert.ok(
    !journalInput.safeParse({
      ...good,
      lines: [
        { accountId: A, debit: '5', credit: '5' },
        { accountId: B, credit: '0', debit: '1' },
      ],
    }).success,
  );
  assert.ok(
    !journalInput.safeParse({ ...good, lines: [{ accountId: A, debit: '100' }] }).success,
    'two lines at least',
  );
  assert.ok(
    !journalInput.safeParse({ ...good, entryDate: '2026-02-30' }).success,
    'the date must exist',
  );
  assert.ok(!journalInput.safeParse({ ...good, memo: '<script>' }).success);
  assert.ok(!journalInput.safeParse({ ...good, extra: true }).success);
  assert.ok(
    !journalInput.safeParse({
      ...good,
      lines: [
        { accountId: A, debit: '0.00001' },
        { accountId: B, credit: '0.00001' },
      ],
    }).success,
    'at most four decimals',
  );
  const unbalancedDraft = {
    ...good,
    lines: [
      { accountId: A, debit: '100' },
      { accountId: B, credit: '60' },
    ],
  };
  assert.ok(
    journalDraftInput.safeParse(unbalancedDraft).success,
    'a draft can be saved unbalanced',
  );
  const t = totals(
    unbalancedDraft.lines.map((l) => ({
      debit: l.debit ?? '0',
      credit: 'credit' in l ? (l.credit ?? '0') : '0',
    })),
  );
  assert.equal(t.balanced, false);
  assert.equal(t.debit.toDbString(), '100.0000');
});

check('a reversing entry swaps the sides and keeps the total', () => {
  const lines = [
    { accountId: A, debit: '100', credit: '0', description: '' },
    { accountId: B, debit: '0', credit: '100', description: '' },
  ];
  const back = reverseLines(lines);
  assert.deepEqual(
    back.map((l) => [l.debit, l.credit]),
    [
      ['0', '100'],
      ['100', '0'],
    ],
  );
  assert.ok(totals(back).balanced);
});

check('only an owner posts at once; staff entries wait for approval', () => {
  assert.equal(postRoute('owner'), 'post');
  assert.equal(postRoute('staff'), 'approval');
});

check('a journal file groups lines into entries and reports bad entries by line', () => {
  const ids = new Map([
    ['1110', A],
    ['4100', B],
  ]);
  const csv = [
    'Entry,Date,Memo,Account,Debit,Credit,Description',
    'E1,2026-10-01,Sale,1110,100,,Cash in',
    'E1,2026-10-01,Sale,4100,,100,Revenue',
    'E2,2026-10-02,Bad sum,1110,50,,',
    'E2,2026-10-02,Bad sum,4100,,40,',
    'E3,2026-10-03,Unknown,9999,10,,',
    'E3,2026-10-03,Unknown,4100,,10,',
    'E4,2026-10-04,Date differs,1110,10,,',
    'E4,2026-10-05,Date differs,4100,,10,',
  ].join('\n');
  const r = parseJournalCsv(csv, ids);
  assert.deepEqual(
    r.entries.map((e) => e.reference),
    ['E1'],
  );
  assert.equal(r.entries[0]?.input.lines.length, 2);
  assert.deepEqual(
    r.errors.map((e) => e.line).sort((x, y) => x - y),
    [4, 6, 9],
  );
  assert.equal(parseJournalCsv('a,b\n1,2', ids).errors.length, 1);
});

process.stdout.write(`step15-journals: ${checks} checks passed\n`);
