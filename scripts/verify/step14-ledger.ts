// path: scripts/verify/step14-ledger.ts
// Logic checks of the wallet ledger vocabulary, the fee calculator and the statement maths (14.1) that need no database.
// The database side (balance equals ledger, no overdraw, replay) is checked by sql/assertions/s14_001_wallet_ledger.sql and
// scripts/verify/step14-ledger.sh. Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step14-ledger.ts
import assert from 'node:assert/strict';
import {
  DEFAULT_FEE_SCHEDULE,
  computeFee,
  feeBreakdown,
  feeModelSchema,
  feeScheduleSchema,
  resolveFeeModel,
  type FeeModel,
  type FeeSchedule,
} from '@/lib/payment/fee-calculator';
import {
  assertValidLegs,
  balanceOf,
  creditLegs,
  debitLegs,
  holdLegs,
  legsToJson,
  releaseLegs,
  type Leg,
} from '@/lib/payment/wallet';
import { Money } from '@/lib/utils/currency';
import { buildStatement, csvCell, ledgerCsv, type LedgerLine } from '@/services/wallet/statement';

let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve(fn()).then(
    () => void (checks += 1),
    (error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    },
  );

const W = '0192f1c0-0000-7000-8000-000000000001';
const m = (v: string): Money => Money.parse(v);

async function main(): Promise<void> {
  await check('every standard posting adds up to zero and is valid', () => {
    for (const legs of [
      creditLegs(W, m('10.5')),
      debitLegs(W, m('3')),
      debitLegs(W, m('3'), true),
      holdLegs(W, m('4')),
      releaseLegs(W, m('4')),
    ]) {
      assertValidLegs(legs);
      assert.ok(Money.sum(legs.map((l) => l.amount)).isZero());
    }
    assert.equal(debitLegs(W, m('3'), true)[0]?.floor, false);
    assert.equal(debitLegs(W, m('3'))[0]?.floor, undefined);
  });

  await check('bad postings are refused before they reach the database', () => {
    assert.throws(
      () => assertValidLegs([{ walletId: W, account: 'available', amount: m('5') }]),
      'one leg',
    );
    assert.throws(
      () =>
        assertValidLegs([
          { walletId: W, account: 'available', amount: m('5') },
          { walletId: null, account: 'clearing', amount: m('-4') },
        ]),
      'not zero',
    );
    assert.throws(
      () =>
        assertValidLegs([
          { walletId: null, account: 'available', amount: m('5') },
          { walletId: null, account: 'clearing', amount: m('-5') },
        ]),
      'company account without wallet',
    );
    assert.throws(
      () =>
        assertValidLegs([
          { walletId: W, account: 'clearing', amount: m('5') },
          { walletId: null, account: 'clearing', amount: m('-5') },
        ]),
      'platform account with wallet',
    );
    assert.throws(
      () =>
        assertValidLegs([
          { walletId: W, account: 'available', amount: Money.zero() },
          { walletId: null, account: 'clearing', amount: Money.zero() },
        ]),
      'zero legs',
    );
    assert.throws(() => creditLegs(W, m('0')), 'zero credit');
    assert.throws(() => debitLegs(W, m('-1')), 'negative debit');
    const many: Leg[] = Array.from({ length: 14 }, (_, i) => ({
      walletId: null,
      account: 'clearing',
      amount: m(i % 2 ? '1' : '-1'),
    }));
    assert.throws(() => assertValidLegs(many), 'too many legs');
  });

  await check('the legs go to the database in its own shape, amounts as exact text', () => {
    const json = legsToJson(debitLegs(W, m('12.3456'), true));
    assert.deepEqual(json, [
      { wallet_id: W, account: 'available', amount: '-12.3456', floor: false },
      { wallet_id: null, account: 'clearing', amount: '12.3456' },
    ]);
  });

  await check('a balance is the sum of its legs through credit, hold, release and debit', () => {
    const all = [
      ...creditLegs(W, m('100')),
      ...holdLegs(W, m('30')),
      ...releaseLegs(W, m('10')),
      ...debitLegs(W, m('25')),
    ];
    assert.equal(balanceOf(all, W, 'available').toDbString(), '55.0000');
    assert.equal(balanceOf(all, W, 'held').toDbString(), '20.0000');
  });

  await check('fee models: flat, percent, percent plus fixed, tiered, with limits', () => {
    const flat: FeeModel = { kind: 'flat', fixed: '0.30' };
    const pct: FeeModel = { kind: 'percent', rate: '2.9' };
    const mixed: FeeModel = { kind: 'percent_plus_fixed', rate: '2.9', fixed: '0.30' };
    assert.equal(computeFee(m('100'), flat).toDbString(), '0.3000');
    assert.equal(computeFee(m('100'), pct).toDbString(), '2.9000');
    assert.equal(computeFee(m('100'), mixed).toDbString(), '3.2000');
    assert.equal(
      computeFee(m('33.33'), pct).toDbString(),
      '0.9666',
      'rounds half up to four places',
    );
    const tiered: FeeModel = {
      kind: 'tiered',
      tiers: [
        { upTo: '100', rate: '3', fixed: '0.30' },
        { upTo: '1000', rate: '2', fixed: '0.30' },
        { upTo: null, rate: '1', fixed: '0' },
      ],
    };
    assert.equal(
      computeFee(m('100'), tiered).toDbString(),
      '3.3000',
      'the limit belongs to its own tier',
    );
    assert.equal(computeFee(m('100.01'), tiered).toDbString(), '2.3002');
    assert.equal(computeFee(m('5000'), tiered).toDbString(), '50.0000');
    assert.equal(
      computeFee(m('1'), { kind: 'percent', rate: '2', min: '0.50' }).toDbString(),
      '0.5000',
      'minimum',
    );
    assert.equal(
      computeFee(m('1000'), { kind: 'percent', rate: '2', max: '5' }).toDbString(),
      '5.0000',
      'maximum',
    );
    assert.equal(computeFee(m('0.20'), flat).toDbString(), '0.2000', 'never more than the payment');
    assert.equal(computeFee(Money.zero(), pct).toDbString(), '0.0000', 'nothing on nothing');
  });

  await check(
    'fee schedules: strict shape, tier order, per-processor model, platform default',
    () => {
      const ok: FeeSchedule = {
        default: { kind: 'percent', rate: '2' },
        byProcessor: { stripe: { kind: 'flat', fixed: '1' } },
        taxRate: '0',
      };
      assert.ok(feeScheduleSchema.safeParse(ok).success);
      assert.ok(feeScheduleSchema.safeParse(DEFAULT_FEE_SCHEDULE).success);
      assert.ok(!feeScheduleSchema.safeParse({ ...ok, extra: 1 }).success);
      assert.ok(!feeScheduleSchema.safeParse({ ...ok, taxRate: '-1' }).success);
      assert.ok(!feeModelSchema.safeParse({ kind: 'percent', rate: '2,5' }).success);
      assert.ok(
        !feeModelSchema.safeParse({ kind: 'percent', rate: '2', fixed: '1' }).success,
        'unknown field',
      );
      const badOrder = {
        ...ok,
        default: {
          kind: 'tiered',
          tiers: [
            { upTo: '1000', rate: '2', fixed: '0' },
            { upTo: '100', rate: '1', fixed: '0' },
            { upTo: null, rate: '1', fixed: '0' },
          ],
        },
      };
      assert.ok(!feeScheduleSchema.safeParse(badOrder).success, 'tiers must go up');
      const noOpenEnd = {
        ...ok,
        default: { kind: 'tiered', tiers: [{ upTo: '100', rate: '2', fixed: '0' }] },
      };
      assert.ok(!feeScheduleSchema.safeParse(noOpenEnd).success, 'last tier must be open');
      assert.equal(resolveFeeModel(ok, 'stripe').kind, 'flat');
      assert.equal(resolveFeeModel(ok, 'paypal').kind, 'percent');
      assert.equal(resolveFeeModel(ok, null).kind, 'percent');
    },
  );

  await check(
    'the breakdown: fee, tax on the fee, processor cost shown, net to the company',
    () => {
      const schedule: FeeSchedule = {
        default: { kind: 'percent_plus_fixed', rate: '2', fixed: '0.50' },
        byProcessor: {},
        taxRate: '10',
      };
      const b = feeBreakdown(m('100'), schedule, 'stripe', m('3.2'));
      assert.equal(b.platformFee.toDbString(), '2.5000');
      assert.equal(b.tax.toDbString(), '0.2500');
      assert.equal(b.totalFees.toDbString(), '2.7500');
      assert.equal(b.net.toDbString(), '97.2500');
      assert.equal(
        b.processorFee.toDbString(),
        '3.2000',
        'a cost of the platform, not taken from the company',
      );
      assert.ok(b.net.add(b.totalFees).eq(b.gross));
      const tiny = feeBreakdown(m('0.40'), schedule, null);
      assert.equal(tiny.net.toDbString(), '0.0000');
      assert.ok(tiny.totalFees.lte(tiny.gross), 'fees never exceed the payment');
    },
  );

  await check('statement: opening plus lines gives closing; money in and out are separated', () => {
    const line = (
      id: string,
      at: string,
      account: 'available' | 'held',
      amount: string,
    ): LedgerLine => ({
      id,
      at,
      reason: 'r',
      referenceType: 't',
      referenceId: null,
      account,
      amount: m(amount),
    });
    const s = buildStatement('2026-10-01', '2026-11-01', { available: m('10'), held: m('0') }, [
      line('b', '2026-10-03T00:00:00.000Z', 'available', '-4'),
      line('a', '2026-10-02T00:00:00.000Z', 'held', '30'),
      line('c', '2026-10-02T00:00:00.000Z', 'available', '50'),
    ]);
    assert.deepEqual(
      s.lines.map((l) => l.id),
      ['a', 'c', 'b'],
    );
    assert.equal(s.closing.available.toDbString(), '56.0000');
    assert.equal(s.closing.held.toDbString(), '30.0000');
    assert.equal(s.totals.in.toDbString(), '50.0000');
    assert.equal(s.totals.out.toDbString(), '4.0000');
  });

  await check(
    'CSV: cells that a spreadsheet would run as a formula are neutralised, quotes are escaped',
    () => {
      assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
      assert.equal(csvCell('+1'), "'+1");
      assert.equal(csvCell('-2'), "'-2");
      assert.equal(csvCell('@cmd'), "'@cmd");
      assert.equal(csvCell('plain'), 'plain');
      assert.equal(csvCell('a,b'), '"a,b"');
      assert.equal(csvCell('say "hi"'), '"say ""hi"""');
      const csv = ledgerCsv([
        {
          id: '1',
          at: '2026-10-02T00:00:00.000Z',
          reason: '=HYPERLINK("x")',
          referenceType: 'payment',
          referenceId: null,
          account: 'available',
          amount: m('-5'),
        },
      ]);
      const rows = csv.trimEnd().split('\r\n');
      assert.equal(rows.length, 2);
      assert.ok(rows[1]?.includes(`"'=HYPERLINK(""x"")"`));
      assert.ok(rows[1]?.endsWith(',available,-5.0000'));
    },
  );

  process.stdout.write(`step14-ledger: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
