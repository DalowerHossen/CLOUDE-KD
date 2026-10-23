// path: scripts/verify/step15-budgets.ts
// Logic checks of the budget, forecast, insight and consolidation rules (15.7.b) that need no database: spreading amounts over
// months, copying with a percent, overspend levels, variance and the projection of the year, the 30, 60 and 90 day cash
// projection, runway, the trend line, break-even, health score, the consolidation with intercompany eliminations. The status
// moves, the one approved budget per year and the group rules are checked in the database by sql/assertions/s15_008_budgets_entities.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-budgets.ts
import assert from 'node:assert/strict';
import { Money } from '@/lib/utils/currency';
import type { AccountMeta, Balance } from '@/services/accounting/report-rules';
import {
  budgetInput,
  copyCells,
  copyInput,
  lineInput,
  monthsOf,
  overspendLevel,
  projectYear,
  spread,
  variance,
} from '@/services/budget/budget-rules';
import { consolidate, memberInput, pairInput } from '@/services/budget/consolidation-rules';
import {
  cashProjection,
  expectedDay,
  lowCash,
  monthlyBurn,
  runwayMonths,
  trendForecast,
} from '@/services/budget/forecast-rules';
import {
  breakEven,
  coachTips,
  healthScore,
  insights,
  percentChange,
  returnOnAssets,
  seasonality,
  trendChange,
  type InsightFacts,
} from '@/services/budget/insight-rules';

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
const sumOf = (list: readonly Money[]): string => Money.sum([...list]).toDbString();

check(
  'spreading: monthly, quarterly (remainder in the last month of the quarter) and yearly',
  () => {
    const monthly = spread(
      'monthly',
      Array.from({ length: 12 }, (_, i) => String(i + 1)),
    );
    assert.equal(monthly?.length, 12);
    assert.equal(monthly?.[11]?.toDbString(), '12.0000');
    const q = spread('quarterly', ['1000', '0', '0', '0']);
    assert.deepEqual(
      q?.slice(0, 3).map((m) => m.toDbString()),
      ['333.3333', '333.3333', '333.3334'],
    );
    assert.equal(sumOf(q ?? []), '1000.0000');
    const y = spread('yearly', ['1200']);
    assert.ok(y?.every((m) => m.toDbString() === '100.0000'));
    assert.equal(spread('yearly', ['100', '100']), null);
    assert.equal(spread('monthly', ['1']), null);
    assert.equal(sumOf(spread('yearly', ['100']) ?? []), '100.0000');
  },
);

check('the twelve months of a budget year', () => {
  const m = monthsOf('2026-04-01');
  assert.equal(m[0], '2026-04-01');
  assert.equal(m[11], '2027-03-01');
});

check('copy from last year: shifted twelve months and changed by a percent', () => {
  const cells = [{ accountId: A, month: '2025-01-01', amount: '1000' }];
  const up = copyCells(cells, 12, '10');
  assert.equal(up[0]?.month, '2026-01-01');
  assert.equal(up[0]?.amount, '1100.0000');
  assert.equal(copyCells(cells, 12, '-50')[0]?.amount, '500.0000');
  assert.equal(copyCells(cells, 12, '-100')[0]?.amount, '0.0000');
  assert.equal(copyCells(cells, 12, '0')[0]?.amount, '1000.0000');
});

check('overspend levels: 80 and 100 percent, and any spend with no budget', () => {
  const lvl = (b: string, a: string): number => overspendLevel(Money.parse(b), Money.parse(a));
  assert.equal(lvl('100', '79.99'), 0);
  assert.equal(lvl('100', '80'), 80);
  assert.equal(lvl('100', '99.99'), 80);
  assert.equal(lvl('100', '100'), 100);
  assert.equal(lvl('100', '250'), 100);
  assert.equal(lvl('0', '5'), 100);
  assert.equal(lvl('0', '0'), 0);
  assert.equal(lvl('100', '0'), 0);
});

check('variance: positive is better; used percent, level and the result', () => {
  const accounts = [
    { id: A, code: '6000', name: 'Rent', type: 'expense' as const },
    { id: B, code: '4000', name: 'Sales', type: 'revenue' as const },
  ];
  const r = variance(
    accounts,
    new Map([
      [A, Money.parse('1000')],
      [B, Money.parse('5000')],
    ]),
    new Map([
      [A, Money.parse('900')],
      [B, Money.parse('5500')],
    ]),
  );
  const rent = r.rows.find((x) => x.accountId === A);
  const sales = r.rows.find((x) => x.accountId === B);
  assert.equal(rent?.variance, '100.0000');
  assert.equal(rent?.usedPercent, '90.00');
  assert.equal(rent?.level, 80);
  assert.equal(sales?.variance, '500.0000');
  assert.equal(sales?.level, 0);
  assert.equal(r.resultBudget, '4000.0000');
  assert.equal(r.resultActual, '4600.0000');
  const none = variance(accounts, new Map(), new Map([[A, Money.parse('50')]]));
  assert.equal(none.rows[0]?.level, 100);
  assert.equal(none.rows[0]?.usedPercent, null);
  assert.equal(variance(accounts, new Map(), new Map()).rows.length, 0);
});

check('projection of the year from the last three months', () => {
  const flat = projectYear(
    [Money.parse('100'), Money.parse('100'), Money.parse('100')],
    Money.parse('1200'),
  );
  assert.equal(flat.projectedYear, '1200.0000');
  assert.equal(flat.difference, '0.0000');
  const rising = projectYear(
    ['100', '100', '100', '200', '200', '200'].map((v) => Money.parse(v)),
    Money.parse('1500'),
  );
  assert.equal(rising.projectedRemaining, '1200.0000');
  assert.equal(rising.projectedYear, '2100.0000');
  assert.equal(rising.difference, '600.0000');
  const done = projectYear(
    Array.from({ length: 12 }, () => Money.parse('10')),
    Money.parse('100'),
  );
  assert.equal(done.projectedRemaining, '0.0000');
  assert.equal(projectYear([], Money.parse('100')).projectedYear, '0.0000');
});

check('budget inputs: first of a month, up to twelve amounts, percent shape', () => {
  assert.ok(budgetInput.safeParse({ name: 'FY', fiscalYearStart: '2026-01-01' }).success);
  assert.ok(!budgetInput.safeParse({ name: 'FY', fiscalYearStart: '2026-01-15' }).success);
  assert.ok(!budgetInput.safeParse({ name: '<b>', fiscalYearStart: '2026-01-01' }).success);
  assert.ok(
    !budgetInput.safeParse({ name: 'FY', fiscalYearStart: '2026-01-01', extra: 1 }).success,
  );
  assert.ok(lineInput.safeParse({ accountId: A, amounts: ['1', '2.50'] }).success);
  assert.ok(!lineInput.safeParse({ accountId: A, amounts: [] }).success);
  assert.ok(!lineInput.safeParse({ accountId: A, amounts: ['-1'] }).success);
  assert.ok(
    !lineInput.safeParse({ accountId: A, amounts: Array.from({ length: 13 }, () => '1') }).success,
  );
  const copy = { sourceBudgetId: A, name: 'Next', fiscalYearStart: '2027-01-01' };
  assert.ok(copyInput.safeParse({ ...copy, adjustPercent: '-10' }).success);
  assert.ok(!copyInput.safeParse({ ...copy, adjustPercent: '1e3' }).success);
});

check(
  'cash projection: due dates, late invoices a few days after today, 30 60 90 day totals',
  () => {
    const today = '2026-10-01';
    const p = cashProjection(
      '1000',
      today,
      [
        { date: '2026-10-10', amount: '500', label: 'on time' },
        { date: '2026-09-01', amount: '200', label: 'late' },
        { date: '2026-12-15', amount: '100', label: 'day 75' },
      ],
      [
        { date: '2026-10-20', amount: '300', label: 'bill' },
        { date: '2027-03-01', amount: '999', label: 'beyond' },
      ],
      7,
    );
    assert.equal(expectedDay('2026-09-01', today, 7), '2026-10-08');
    assert.equal(expectedDay('2026-10-10', today, 7), '2026-10-10');
    assert.deepEqual(
      p.horizons.map((h) => [h.days, h.inflow, h.outflow, h.endCash]),
      [
        [30, '700.0000', '300.0000', '1400.0000'],
        [60, '700.0000', '300.0000', '1400.0000'],
        [90, '800.0000', '300.0000', '1500.0000'],
      ],
    );
    assert.equal(p.weeks[p.weeks.length - 1]?.balance, '1500.0000');
    const today0 = cashProjection(
      '0',
      today,
      [{ date: today, amount: '50', label: 'today' }],
      [],
      7,
    );
    assert.equal(today0.horizons[0]?.inflow, '50.0000');
  },
);

check('the lowest point of the projection and the warning', () => {
  const p = cashProjection(
    '1000',
    '2026-10-01',
    [{ date: '2026-12-20', amount: '2000', label: 'late money' }],
    [{ date: '2026-10-10', amount: '1500', label: 'big bill' }],
    7,
  );
  assert.equal(p.lowest.balance, '-500.0000');
  assert.ok(lowCash(p.lowest.balance, '0'));
  assert.ok(!lowCash('100', '100'));
  assert.ok(lowCash('99.99', '100'));
});

check('runway and burn', () => {
  assert.equal(runwayMonths('6000', '1000'), '6.0');
  assert.equal(runwayMonths('1500', '1000'), '1.5');
  assert.equal(runwayMonths('6000', '0'), null);
  assert.equal(runwayMonths('6000', '-50'), null);
  assert.equal(runwayMonths('0', '100'), '0.0');
  assert.equal(monthlyBurn(['1000', '1000', '1000'], ['1500', '1500', '1500']), '500.0000');
  assert.equal(monthlyBurn(['2000'], ['1500']), '-500.0000');
});

check('trend forecast: a straight line, an average for a short history, never below zero', () => {
  assert.deepEqual(trendForecast(['100', '200', '300'], 2), ['400.0000', '500.0000']);
  assert.deepEqual(trendForecast(['100', '300'], 2), ['200.0000', '200.0000']);
  assert.deepEqual(trendForecast(['300', '200', '100'], 3), ['0.0000', '0.0000', '0.0000']);
  assert.deepEqual(trendForecast([], 2), ['0.0000', '0.0000']);
  assert.deepEqual(trendForecast(['50', '50', '50', '50'], 1), ['50.0000']);
});

check('percent change and the trend of the latest month', () => {
  assert.equal(percentChange(Money.parse('110'), Money.parse('100')), '10.00');
  assert.equal(percentChange(Money.parse('90'), Money.parse('100')), '-10.00');
  assert.equal(percentChange(Money.parse('5'), Money.zero()), null);
  const series = Array.from({ length: 13 }, (_, i) => ({
    month: `${i < 1 ? '2025-10' : i < 3 ? `2025-${String(10 + i).padStart(2, '0')}` : `2026-${String(i - 2).padStart(2, '0')}`}`,
    value: String(100 + i * 10),
  }));
  const t = trendChange(series);
  assert.equal(t?.month, '2026-10');
  assert.equal(t?.value, '220');
  assert.equal(t?.monthOverMonth, '4.76');
  assert.equal(t?.yearOverYear, '120.00');
  assert.equal(trendChange([]), null);
  assert.equal(trendChange([{ month: '2026-10', value: '5' }])?.monthOverMonth, null);
});

check('seasonal pattern: December twice as busy', () => {
  const series = ['2025', '2026'].flatMap((y) =>
    Array.from({ length: 12 }, (_, i) => ({
      month: `${y}-${String(i + 1).padStart(2, '0')}`,
      value: i === 11 ? '200' : '100',
    })),
  );
  const s = seasonality(series);
  assert.equal(s.length, 12);
  assert.equal(s[0]?.index, '92');
  assert.equal(s[11]?.index, '185');
  assert.equal(seasonality([])[0]?.index, null);
});

check('break-even and return on assets', () => {
  const be = breakEven(Money.parse('100000'), Money.parse('40000'), Money.parse('30000'));
  assert.equal(be.contributionMarginPercent, '60.00');
  assert.equal(be.breakEvenRevenue, '50000.0000');
  assert.equal(be.marginOfSafetyPercent, '50.00');
  assert.equal(
    breakEven(Money.parse('100'), Money.parse('150'), Money.parse('10')).breakEvenRevenue,
    null,
  );
  assert.equal(breakEven(Money.zero(), Money.zero(), Money.parse('10')).breakEvenRevenue, null);
  assert.equal(returnOnAssets(Money.parse('50'), Money.parse('1000')), '5.00');
  assert.equal(returnOnAssets(Money.parse('50'), Money.zero()), null);
});

check('health score: strong, weak and unknown parts', () => {
  const strong = healthScore({
    currentRatio: '2.5',
    netMarginPercent: '20',
    debtToEquity: '0.3',
    runwayMonths: null,
    cashPositive: true,
    overdueShare: '5',
  });
  assert.equal(strong.score, 100);
  assert.equal(strong.band, 'strong');
  const weak = healthScore({
    currentRatio: '0.4',
    netMarginPercent: '-5',
    debtToEquity: '4',
    runwayMonths: '0.5',
    cashPositive: false,
    overdueShare: '60',
  });
  assert.equal(weak.score, 0);
  assert.equal(weak.band, 'weak');
  const unknown = healthScore({
    currentRatio: null,
    netMarginPercent: null,
    debtToEquity: null,
    runwayMonths: null,
    cashPositive: false,
    overdueShare: null,
  });
  assert.ok(unknown.score > 40 && unknown.score < 100);
  assert.equal(
    strong.parts.reduce((s, p) => s + p.weight, 0),
    100,
  );
});

check('insights and tips follow the facts', () => {
  const facts: InsightFacts = {
    overdueTop: [
      { name: 'Acme', amount: '300' },
      { name: 'Zed', amount: '200' },
    ],
    overdueTotal: '500',
    overBudget: [{ name: 'Rent', usedPercent: '95.00' }],
    runwayMonths: '3.0',
    cashPositive: false,
    netMarginPercent: '3.00',
    netMarginChange: null,
    expenseChange: '30.00',
    revenueChange: '-15.00',
    lowCashDate: '2026-12-01',
    topClientSharePercent: '60.00',
  };
  const list = insights(facts);
  assert.ok(list.some((s) => s.includes('500.0000 USD') && s.includes('Acme')));
  assert.ok(list.some((s) => s.includes('Rent has used 95.00 percent')));
  assert.ok(list.some((s) => s.includes('2026-12-01')));
  assert.ok(list.some((s) => s.includes('about 3.0 months')));
  assert.ok(list.some((s) => s.includes('Expenses grew 30.00 percent')));
  assert.ok(list.some((s) => s.includes('Revenue fell 15.0000 percent')));
  assert.ok(list.some((s) => s.includes('60.00 percent of your revenue')));
  const calm: InsightFacts = {
    ...facts,
    overdueTop: [],
    overdueTotal: '0',
    overBudget: [],
    runwayMonths: null,
    cashPositive: true,
    netMarginPercent: '20',
    expenseChange: null,
    revenueChange: null,
    lowCashDate: null,
    topClientSharePercent: '20',
  };
  assert.equal(insights(calm).length, 0);
  assert.equal(coachTips(calm).length, 1);
  assert.ok(coachTips(facts).length <= 5 && coachTips(facts).length >= 3);
});

const meta = (id: string, code: string, name: string, type: AccountMeta['type']): AccountMeta => ({
  id,
  code,
  name,
  type,
  subtype: 'x',
  isContra: false,
  isCash: false,
  systemKey: null,
});
const bal = (accountId: string, debit: string, credit: string): Balance => ({
  accountId,
  debit,
  credit,
});

check('consolidation: a receivable against a payable cancels and the sheet balances', () => {
  const a = {
    companyId: 'A',
    name: 'Parent',
    ownershipPercent: '100',
    accounts: [
      meta('a1', '1000', 'Bank', 'asset'),
      meta('a2', '1300', 'Due from sub', 'asset'),
      meta('a3', '3000', 'Equity', 'equity'),
    ],
    balances: [bal('a1', '4000', '0'), bal('a2', '1000', '0'), bal('a3', '0', '5000')],
  };
  const b = {
    companyId: 'B',
    name: 'Sub',
    ownershipPercent: '100',
    accounts: [
      meta('b1', '1000', 'Bank', 'asset'),
      meta('b2', '2300', 'Due to parent', 'liability'),
      meta('b3', '3000', 'Equity', 'equity'),
    ],
    balances: [bal('b1', '1500', '0'), bal('b2', '0', '1000'), bal('b3', '0', '500')],
  };
  const none = consolidate([a, b], []);
  assert.equal(none.assets, '6500.0000');
  assert.equal(none.liabilities, '1000.0000');
  assert.ok(none.balanced);
  const pair = [{ label: 'Loan', companyA: 'A', accountA: 'a2', companyB: 'B', accountB: 'b2' }];
  const c = consolidate([a, b], pair);
  assert.equal(c.assets, '5500.0000');
  assert.equal(c.liabilities, '0.0000');
  assert.equal(c.equity, '5500.0000');
  assert.ok(c.balanced);
  assert.equal(c.eliminations[0]?.eliminated, '1000.0000');
  assert.equal(c.eliminations[0]?.difference, '0.0000');
  assert.equal(c.lines.find((l) => l.code === '1000')?.total, '5500.0000');
});

check(
  'consolidation: when the two sides differ only the smaller is eliminated and the difference shows',
  () => {
    const a = {
      companyId: 'A',
      name: 'Parent',
      ownershipPercent: '100',
      accounts: [meta('a2', '1300', 'Due from sub', 'asset')],
      balances: [bal('a2', '1000', '0')],
    };
    const b = {
      companyId: 'B',
      name: 'Sub',
      ownershipPercent: '100',
      accounts: [meta('b2', '2300', 'Due to parent', 'liability')],
      balances: [bal('b2', '0', '800')],
    };
    const c = consolidate(
      [a, b],
      [{ label: 'Loan', companyA: 'A', accountA: 'a2', companyB: 'B', accountB: 'b2' }],
    );
    assert.equal(c.eliminations[0]?.eliminated, '800.0000');
    assert.equal(c.eliminations[0]?.difference, '200.0000');
    assert.equal(c.assets, '200.0000');
    assert.equal(c.liabilities, '0.0000');
  },
);

check('consolidation: intercompany revenue against expense, and the share of other owners', () => {
  const a = {
    companyId: 'A',
    name: 'Parent',
    ownershipPercent: '100',
    accounts: [
      meta('a1', '4000', 'Sales', 'revenue'),
      meta('a2', '4100', 'Sales to sub', 'revenue'),
    ],
    balances: [bal('a1', '0', '900'), bal('a2', '0', '500')],
  };
  const b = {
    companyId: 'B',
    name: 'Sub',
    ownershipPercent: '80',
    accounts: [meta('b1', '6000', 'Cost', 'expense'), meta('b2', '4000', 'Sales', 'revenue')],
    balances: [bal('b1', '500', '0'), bal('b2', '0', '600')],
  };
  const c = consolidate(
    [a, b],
    [{ label: 'Services', companyA: 'A', accountA: 'a2', companyB: 'B', accountB: 'b1' }],
  );
  assert.equal(c.revenue, '1500.0000');
  assert.equal(c.expenses, '0.0000');
  assert.equal(c.netIncome, '1500.0000');
  assert.equal(c.minority[0]?.name, 'Sub');
  assert.equal(c.minority[0]?.percent, '20.0000');
  assert.equal(c.minority[0]?.share, '20.0000');
  assert.equal(consolidate([a], []).minority.length, 0);
});

check('group inputs: a share above zero and at most 100, two different companies in a pair', () => {
  assert.ok(memberInput.safeParse({ memberCompanyId: A }).success);
  assert.ok(memberInput.safeParse({ memberCompanyId: A, ownershipPercent: '60.5' }).success);
  assert.ok(!memberInput.safeParse({ memberCompanyId: A, ownershipPercent: '0' }).success);
  assert.ok(!memberInput.safeParse({ memberCompanyId: A, ownershipPercent: '100.5' }).success);
  assert.ok(!memberInput.safeParse({ memberCompanyId: 'x' }).success);
  const pair = { label: 'Loan', companyA: A, accountA: A, companyB: B, accountB: B };
  assert.ok(pairInput.safeParse(pair).success);
  assert.ok(!pairInput.safeParse({ ...pair, companyB: A }).success);
  assert.ok(!pairInput.safeParse({ ...pair, label: '<i>' }).success);
});

process.stdout.write(`step15-budgets: ${checks} checks passed\n`);
