// path: scripts/verify/step16-settlement.ts
// Logic checks of the settlement ledger (16.14) that need no database or network: the inputs, how an entry is worked out (sale,
// refund, chargeback, adjustment), rounding, the hold, the terms in force at a time, the balance rule (the same numbers as the database
// assertions), and the statement file. The tables and the payout function are tested in sql/assertions/s16_021_settlement.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-settlement.ts
import assert from 'node:assert/strict';
import {
  NO_TERMS,
  balanceOf,
  entriesBatch,
  entryInput,
  payoutInput,
  statementCsv,
  termsAt,
  termsInput,
  voidInput,
  workOutEntry,
  type TermsLike,
} from '@/lib/gateway/split-rules';

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

const T0 = new Date('2026-10-24T10:00:00Z');
const terms: TermsLike = {
  id: 't1',
  commissionPercent: '2.5',
  fixedFee: '0.3',
  holdDays: 7,
  minPayout: '10',
};

check('a sale: commission, fixed fee, net and the hold', () => {
  const e = workOutEntry('sale', '100', terms, T0);
  assert.equal(e.gross, '100.0000');
  assert.equal(e.commission, '2.5000');
  assert.equal(e.fixedFee, '0.3000');
  assert.equal(e.net, '97.2000');
  assert.equal(e.availableAt, '2026-10-31T10:00:00.000Z');
  assert.equal(e.termsId, 't1');
});

check('rounding is half up to four places', () => {
  assert.equal(workOutEntry('sale', '10.01', { ...terms, fixedFee: '0' }, T0).commission, '0.2503');
  assert.equal(
    workOutEntry('sale', '0.5', { ...terms, commissionPercent: '33.3333', fixedFee: '0' }, T0)
      .commission,
    '0.1667',
  );
  assert.equal(
    workOutEntry('sale', '99999999999999', { ...terms, commissionPercent: '0', fixedFee: '0' }, T0)
      .net,
    '99999999999999.0000',
  );
});

check(
  'a refund and a chargeback are negative, return the commission, no fee, and count at once',
  () => {
    const r = workOutEntry('refund', '40', terms, T0);
    assert.equal(r.gross, '-40.0000');
    assert.equal(r.commission, '-1.0000');
    assert.equal(r.fixedFee, '0.0000');
    assert.equal(r.net, '-39.0000');
    assert.equal(r.availableAt, T0.toISOString());
    const c = workOutEntry('chargeback', '200', terms, T0);
    assert.equal(c.net, '-195.0000');
    assert.equal(workOutEntry('refund', '-40', terms, T0).gross, '-40.0000');
  },
);

check('an adjustment is signed and carries nothing', () => {
  const up = workOutEntry('adjustment', '12.5', terms, T0);
  assert.deepEqual(
    [up.gross, up.commission, up.fixedFee, up.net],
    ['12.5000', '0.0000', '0.0000', '12.5000'],
  );
  const down = workOutEntry('adjustment', '-3', terms, T0);
  assert.equal(down.net, '-3.0000');
  assert.equal(down.availableAt, T0.toISOString());
});

check('a sale smaller than its fee is refused; without terms nothing is taken', () => {
  assert.throws(() => workOutEntry('sale', '0.2', terms, T0), RangeError);
  const e = workOutEntry('sale', '20', NO_TERMS, T0);
  assert.deepEqual(
    [e.commission, e.fixedFee, e.net, e.availableAt],
    ['0.0000', '0.0000', '20.0000', T0.toISOString()],
  );
});

check(
  'terms in force: the sub-merchant version by time, else the company default, else none',
  () => {
    const versions = [
      { id: 'a', subMerchantId: null, effectiveFrom: '2026-01-01T00:00:00Z' },
      { id: 'b', subMerchantId: 's1', effectiveFrom: '2026-03-01T00:00:00Z' },
      { id: 'c', subMerchantId: 's1', effectiveFrom: '2026-06-01T00:00:00Z' },
      { id: 'd', subMerchantId: 's2', effectiveFrom: '2026-02-01T00:00:00Z' },
    ];
    assert.equal(termsAt(versions, 's1', new Date('2026-07-01T00:00:00Z'))?.id, 'c');
    assert.equal(termsAt(versions, 's1', new Date('2026-04-01T00:00:00Z'))?.id, 'b');
    assert.equal(termsAt(versions, 's1', new Date('2026-02-01T00:00:00Z'))?.id, 'a');
    assert.equal(termsAt(versions, 's3', new Date('2026-07-01T00:00:00Z'))?.id, 'a');
    assert.equal(termsAt(versions, 's1', new Date('2025-12-31T00:00:00Z')), null);
  },
);

check('the balance: pending sales are held, refunds count at once, payouts are taken off', () => {
  const entries = [
    { net: '97.2000', availableAt: '2026-10-31T10:00:00.000Z' },
    { net: '48.4500', availableAt: '2026-10-21T10:00:00.000Z' },
  ];
  assert.deepEqual(balanceOf(entries, [], T0), {
    totalNet: '145.6500',
    pending: '97.2000',
    paid: '0.0000',
    available: '48.4500',
  });
  assert.equal(balanceOf(entries, ['40'], T0).available, '8.4500');
  const after = new Date('2026-11-01T00:00:00Z');
  assert.equal(balanceOf(entries, ['40'], after).available, '105.6500');
  const withChargeback = [...entries, { net: '-195.0000', availableAt: T0.toISOString() }];
  assert.equal(balanceOf(withChargeback, [], T0).available, '-146.5500');
});

check('terms input: percent and money text, hold days, strict', () => {
  const ok = termsInput.safeParse({
    commissionPercent: '2.5',
    fixedFee: '0.30',
    holdDays: 7,
    minPayout: '10',
  });
  assert.ok(ok.success && ok.data.subMerchantId === null);
  for (const bad of [
    { commissionPercent: '101', fixedFee: '0', holdDays: 0, minPayout: '0' },
    { commissionPercent: '2.12345', fixedFee: '0', holdDays: 0, minPayout: '0' },
    { commissionPercent: '2', fixedFee: '-1', holdDays: 0, minPayout: '0' },
    { commissionPercent: '2', fixedFee: '1.00001', holdDays: 0, minPayout: '0' },
    { commissionPercent: '2', fixedFee: '0', holdDays: 181, minPayout: '0' },
    { commissionPercent: '2', fixedFee: '0', holdDays: 1.5, minPayout: '0' },
    { commissionPercent: '2', fixedFee: '0', holdDays: 0, minPayout: '0', extra: 1 },
  ])
    assert.equal(termsInput.safeParse(bad).success, false, JSON.stringify(bad));
});

check('entry input: sign rules by kind, reference shape, no zero', () => {
  const base = { externalRef: 'order-1', occurredAt: '2026-10-24T10:00:00Z' };
  assert.ok(entryInput.safeParse({ kind: 'sale', amount: '10', ...base }).success);
  assert.equal(entryInput.safeParse({ kind: 'sale', amount: '-10', ...base }).success, false);
  assert.equal(entryInput.safeParse({ kind: 'sale', amount: '0', ...base }).success, false);
  assert.ok(entryInput.safeParse({ kind: 'adjustment', amount: '-10', ...base }).success);
  assert.equal(
    entryInput.safeParse({ kind: 'adjustment', amount: '0.0000', ...base }).success,
    false,
  );
  assert.equal(
    entryInput.safeParse({ kind: 'sale', amount: '10', ...base, externalRef: 'has space' }).success,
    false,
  );
  assert.equal(entryInput.safeParse({ kind: 'sale', amount: '10.00001', ...base }).success, false);
  assert.equal(entryInput.safeParse({ kind: 'gift', amount: '10', ...base }).success, false);
  assert.equal(
    entryInput.safeParse({ kind: 'sale', amount: '10', ...base, note: '<b>x</b>' }).success,
    false,
  );
  assert.equal(
    entryInput.safeParse({ kind: 'sale', amount: '10', ...base, occurredAt: 'yesterday' }).success,
    false,
  );
});

check('a batch holds 1 to 200 entries of one sub-merchant', () => {
  const entry = {
    kind: 'sale',
    amount: '10',
    externalRef: 'o-1',
    occurredAt: '2026-10-24T10:00:00Z',
  };
  const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
  assert.ok(entriesBatch.safeParse({ subMerchantId: id, entries: [entry] }).success);
  assert.equal(entriesBatch.safeParse({ subMerchantId: id, entries: [] }).success, false);
  assert.equal(
    entriesBatch.safeParse({ subMerchantId: id, entries: Array.from({ length: 201 }, () => entry) })
      .success,
    false,
  );
  assert.equal(entriesBatch.safeParse({ subMerchantId: 'x', entries: [entry] }).success, false);
});

check('payout and void inputs', () => {
  const ok = {
    subMerchantId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    amount: '40',
    reference: 'bank-1',
    paidAt: '2026-10-24T10:00:00Z',
    idempotencyKey: 'abcdefghijklmnop1234',
  };
  assert.ok(payoutInput.safeParse(ok).success);
  assert.equal(payoutInput.safeParse({ ...ok, amount: '0' }).success, false);
  assert.equal(payoutInput.safeParse({ ...ok, amount: '-5' }).success, false);
  assert.equal(payoutInput.safeParse({ ...ok, idempotencyKey: 'short' }).success, false);
  assert.equal(payoutInput.safeParse({ ...ok, reference: '' }).success, false);
  assert.ok(voidInput.safeParse({ reason: 'Sent to the wrong account', version: 1 }).success);
  assert.equal(voidInput.safeParse({ reason: 'no', version: 1 }).success, false);
});

check('the statement: header, exact amounts, formula-like text made safe', () => {
  const csv = statementCsv([
    {
      occurredAt: '2026-10-24T10:00:00Z',
      kind: 'sale',
      externalRef: 'o-1',
      gross: '100.0000',
      commission: '2.5000',
      fixedFee: '0.3000',
      net: '97.2000',
      availableAt: '2026-10-31T10:00:00Z',
      note: '=HYPERLINK("http://x")',
    },
    {
      occurredAt: '2026-10-25T10:00:00Z',
      kind: 'refund',
      externalRef: 'o-1',
      gross: '-40.0000',
      commission: '-1.0000',
      fixedFee: '0.0000',
      net: '-39.0000',
      availableAt: '2026-10-25T10:00:00Z',
      note: 'a, b',
    },
  ]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0] ?? '', /^Date,Kind,Reference,Gross \(USD\)/);
  assert.match(lines[1] ?? '', /,97\.2000,/);
  assert.ok((lines[1] ?? '').includes("'=HYPERLINK"));
  assert.match(lines[2] ?? '', /,-39\.0000,/);
  assert.ok((lines[2] ?? '').includes('"a, b"'));
});

process.stdout.write(`step16-settlement: ${checks} checks passed\n`);
