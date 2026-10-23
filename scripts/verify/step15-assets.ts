// path: scripts/verify/step15-assets.ts
// Logic checks of the fixed asset rules (15.7.a) that need no database: the monthly amount of each method, the schedule that ends
// exactly at the salvage value, the entries for buying, depreciating and disposing of an asset, the CSV import and the strict input.
// The one-row-per-month rule, the frozen terms and the account checks are checked in the database by sql/assertions/s15_007_assets.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-assets.ts
import assert from 'node:assert/strict';
import { Money } from '@/lib/utils/currency';
import { totals } from '@/services/accounting/journal-rules';
import {
  assetInput,
  depreciationLines,
  disposalLines,
  monthAmount,
  monthEnd,
  monthStart,
  parseAssetsCsv,
  purchaseLines,
  schedule,
  type AssetTerms,
  type Line,
} from '@/services/asset/depreciation-rules';

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
const CATEGORY = '11111111-1111-4111-8111-111111111111';

const terms = (over: Partial<AssetTerms>): AssetTerms => ({
  cost: '12000',
  salvage: '0',
  lifeMonths: 12,
  method: 'straight_line',
  factor: '2',
  totalUnits: null,
  inService: '2026-01-15',
  ...over,
});
const balanced = (lines: readonly Line[]): boolean =>
  totals(
    lines.map((l) => ({
      debit: l.side === 'debit' ? l.amount.toDbString() : '0',
      credit: l.side === 'credit' ? l.amount.toDbString() : '0',
    })),
  ).balanced;

check('straight line: the same amount every month and the whole cost over the life', () => {
  const s = schedule(terms({}));
  assert.equal(s.length, 12);
  assert.ok(s.every((r) => r.amount === '1000.0000'));
  assert.equal(s[11]?.accumulated, '12000.0000');
  assert.equal(s[11]?.netBookValue, '0.0000');
  assert.equal(s[0]?.month, '2026-01-01');
  assert.equal(s[11]?.month, '2026-12-01');
});

check('straight line with a salvage value stops there', () => {
  const s = schedule(terms({ cost: '1000', salvage: '100', lifeMonths: 3 }));
  assert.deepEqual(
    s.map((r) => r.amount),
    ['300.0000', '300.0000', '300.0000'],
  );
  assert.equal(s[2]?.netBookValue, '100.0000');
});

check('an amount that does not divide: the last month takes the remainder', () => {
  const s = schedule(terms({ cost: '1000', lifeMonths: 3 }));
  assert.equal(s[2]?.accumulated, '1000.0000');
  const sum = Money.sum(s.map((r) => Money.parse(r.amount)));
  assert.equal(sum.toDbString(), '1000.0000');
});

check('declining balance: falls each month, never below the salvage value', () => {
  const t = terms({
    cost: '10000',
    salvage: '1000',
    lifeMonths: 60,
    method: 'declining_balance',
  });
  const s = schedule(t);
  assert.equal(s[0]?.amount, '333.3333');
  assert.ok(Money.parse(s[1]?.amount ?? '0').lt(Money.parse(s[0]?.amount ?? '0')));
  assert.equal(s[59]?.accumulated, '9000.0000');
  assert.ok(s.every((r) => Money.parse(r.netBookValue).gte('1000')));
});

check('sum of the digits: 3, 2, 1 sixths of the depreciable amount', () => {
  const s = schedule(terms({ cost: '600', lifeMonths: 3, method: 'sum_of_years' }));
  assert.deepEqual(
    s.map((r) => r.amount),
    ['300.0000', '200.0000', '100.0000'],
  );
});

check('units of production: follows the use and is capped at what is left', () => {
  const t = terms({
    cost: '10000',
    salvage: '1000',
    lifeMonths: 120,
    method: 'units_of_production',
    totalUnits: '1000',
  });
  assert.equal(schedule(t).length, 0);
  assert.equal(
    monthAmount(t, { accumulated: '0', monthsDone: 0, units: '100' }).toDbString(),
    '900.0000',
  );
  assert.equal(
    monthAmount(t, { accumulated: '8500', monthsDone: 5, units: '400' }).toDbString(),
    '500.0000',
  );
  assert.ok(monthAmount(t, { accumulated: '0', monthsDone: 0, units: '0' }).isZero());
  assert.ok(monthAmount(t, { accumulated: '9000', monthsDone: 9, units: '50' }).isZero());
});

check('months: first and last day', () => {
  assert.equal(monthStart('2026-10-23'), '2026-10-01');
  assert.equal(monthEnd('2026-02-01'), '2026-02-28');
  assert.equal(monthEnd('2028-02-01'), '2028-02-29');
  assert.equal(monthEnd('2026-12-01'), '2026-12-31');
});

check('buying an asset: asset debited, bank or payables credited, balanced', () => {
  const paid = purchaseLines(Money.parse('1200'), 'bank', 'Laptop');
  assert.equal(paid[0]?.key, 'fixed_assets');
  assert.equal(paid[0]?.side, 'debit');
  assert.equal(paid[1]?.key, 'bank');
  assert.ok(balanced(paid));
  assert.equal(purchaseLines(Money.parse('1200'), 'payable', 'Laptop')[1]?.key, 'accounts_payable');
});

check(
  'a month of depreciation: expense debited, accumulated credited, grouped by category accounts',
  () => {
    const lines = depreciationLines([
      { amount: Money.parse('100') },
      { amount: Money.parse('50') },
      { amount: Money.parse('25'), expenseAccountId: 'e1', accumulatedAccountId: 'a1' },
    ]);
    assert.equal(lines.length, 4);
    assert.ok(balanced(lines));
    const plain = lines.filter((l) => l.accountId === undefined && l.side === 'debit');
    assert.equal(plain[0]?.amount.toDbString(), '150.0000');
    assert.equal(depreciationLines([{ amount: Money.zero() }]).length, 0);
  },
);

check('selling at a gain and at a loss, and scrapping', () => {
  const gain = disposalLines(Money.parse('1000'), Money.parse('400'), Money.parse('700'), 'Van');
  assert.equal(gain.netBookValue.toDbString(), '600.0000');
  assert.equal(gain.gainLoss.toDbString(), '100.0000');
  assert.ok(balanced(gain.lines));
  assert.ok(gain.lines.some((l) => l.key === 'disposal_gain_loss' && l.side === 'credit'));
  const loss = disposalLines(Money.parse('1000'), Money.parse('400'), Money.parse('300'), 'Van');
  assert.equal(loss.gainLoss.toDbString(), '-300.0000');
  assert.ok(balanced(loss.lines));
  assert.ok(loss.lines.some((l) => l.key === 'disposal_gain_loss' && l.side === 'debit'));
  const scrap = disposalLines(Money.parse('1000'), Money.parse('1000'), Money.zero(), 'Van');
  assert.ok(scrap.gainLoss.isZero());
  assert.ok(scrap.lines.every((l) => l.key !== 'disposal_gain_loss'));
  assert.ok(balanced(scrap.lines));
});

check('the CSV import lists bad rows by line and keeps the good ones', () => {
  const csv = [
    'name,category,purchase date,cost,life months,serial number',
    'Laptop,Computer equipment,2025-03-01,1200,36,SN1',
    'Broken,Computer equipment,2025-13-40,1200,36,',
    'Free,Computer equipment,2025-03-01,0,36,',
    'Van,Vehicles,2024-01-10,20000.50,60,',
  ].join('\n');
  const r = parseAssetsCsv(csv);
  assert.equal(r.assets.length, 2);
  assert.deepEqual(r.errors.map((e) => e.line).sort(), [3, 4]);
  assert.equal(r.assets[0]?.input.serialNumber, 'SN1');
  assert.equal(r.assets[1]?.input.cost, '20000.50');
  assert.equal(parseAssetsCsv('a,b\n1,2').errors.length, 1);
});

check(
  'strict input: cost above zero, salvage not above cost, units for the units method, no markup',
  () => {
    const base = {
      name: 'Laptop',
      categoryId: CATEGORY,
      purchaseDate: '2026-01-10',
      cost: '1200',
      lifeMonths: 36,
      method: 'straight_line' as const,
    };
    assert.ok(assetInput.safeParse(base).success);
    assert.ok(!assetInput.safeParse({ ...base, cost: '0' }).success);
    assert.ok(!assetInput.safeParse({ ...base, salvageValue: '1300' }).success);
    assert.ok(!assetInput.safeParse({ ...base, method: 'units_of_production' }).success);
    assert.ok(
      assetInput.safeParse({ ...base, method: 'units_of_production', totalUnits: '100' }).success,
    );
    assert.ok(!assetInput.safeParse({ ...base, name: '<b>x</b>' }).success);
    assert.ok(!assetInput.safeParse({ ...base, inServiceDate: '2025-01-01' }).success);
    assert.ok(!assetInput.safeParse({ ...base, lifeMonths: 0 }).success);
    assert.ok(!assetInput.safeParse({ ...base, extra: 1 }).success);
    assert.ok(!assetInput.safeParse({ ...base, cost: 'abc' }).success);
  },
);

process.stdout.write(`step15-assets: ${checks} checks passed\n`);
