// path: scripts/verify/step14-payouts.ts
// Logic checks of the payout rules (14.3.a) that need no database: the states, the fee, the local amount, the limit
// window, the retry and schedule times, the approval choice, the postings of each step and the payout method input.
// The database side is checked by sql/assertions/s14_003_payouts.sql and the ledger scripts.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step14-payouts.ts
import assert from 'node:assert/strict';
import {
  BUILT_IN_PAYOUT_RULES,
  MAX_ATTEMPTS,
  PAYOUT_STATUSES,
  approvalNeeded,
  canMove,
  checkAmount,
  creditBackLegs,
  isFinal,
  localAmount,
  nextRun,
  paidLegs,
  payoutAmounts,
  payoutSettingsInput,
  periodStart,
  requestLegs,
  retryAt,
  reversedLegs,
  type PayoutRules,
} from '@/lib/payment/payout';
import { assertValidLegs, balanceOf, type Leg } from '@/lib/payment/wallet';
import { Money } from '@/lib/utils/currency';
import { methodInput } from '@/services/payout/methods';
import { getPartner, listPartners } from '@/services/payout/partners';

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
const rules = (over: Partial<PayoutRules> = {}): PayoutRules => ({ ...BUILT_IN_PAYOUT_RULES, ...over });
const sum = (legs: Leg[], account: Leg['account']): string =>
  legs.filter((l) => l.account === account).reduce((a, l) => a.add(l.amount), Money.zero()).toDbString();

async function main(): Promise<void> {
  await check('the states move only the allowed ways and the end states are final', () => {
    assert.ok(canMove('requested', 'pending_approval'));
    assert.ok(canMove('requested', 'approved'));
    assert.ok(canMove('approved', 'processing'));
    assert.ok(canMove('processing', 'paid'));
    assert.ok(canMove('processing', 'approved')); // a retry
    assert.ok(canMove('processing', 'failed'));
    assert.ok(canMove('paid', 'reversed'));
    assert.ok(!canMove('paid', 'failed'));
    assert.ok(!canMove('requested', 'paid'));
    assert.ok(!canMove('processing', 'cancelled'));
    for (const s of ['failed', 'cancelled', 'reversed'] as const) assert.ok(isFinal(s));
    assert.ok(!isFinal('paid'));
    assert.equal(PAYOUT_STATUSES.length, 8);
  });

  await check('the fee is fixed plus percent, never above the amount', () => {
    const a = payoutAmounts(m('200'), rules({ feeFixed: '1', feePercent: '2' }));
    assert.deepEqual([a.fee.toDbString(), a.net.toDbString()], ['5.0000', '195.0000']);
    const free = payoutAmounts(m('200'), rules());
    assert.equal(free.fee.toDbString(), '0.0000');
    const small = payoutAmounts(m('0.5'), rules({ feeFixed: '3' }));
    assert.deepEqual([small.fee.toDbString(), small.net.toDbString()], ['0.5000', '0.0000']);
  });

  await check('the amount check names the minimum and refuses a payout the fee eats', () => {
    assert.equal(checkAmount(m('50'), rules()), null);
    assert.match(String(checkAmount(m('9.99'), rules())), /smallest payout/);
    assert.match(String(checkAmount(m('0'), rules())), /above zero/);
    assert.match(String(checkAmount(m('10'), rules({ feeFixed: '10' }))), /fee/);
  });

  await check('the local amount uses the frozen rate and the conversion margin', () => {
    assert.equal(localAmount(m('100'), '110.5', '0').toDbString(), '11050.0000');
    assert.equal(localAmount(m('100'), '110.5', '2').toDbString(), '10829.0000');
  });

  await check('approval: a large payout always needs a second person, staff need the owner', () => {
    assert.equal(approvalNeeded('owner', m('100'), '5000'), null);
    assert.equal(approvalNeeded('staff', m('100'), '5000'), 'payout.request');
    assert.equal(approvalNeeded('owner', m('5000'), '5000'), 'payout.large');
    assert.equal(approvalNeeded('staff', m('9000'), '5000'), 'payout.large');
  });

  await check('periods start on the day, the Monday or the first of the month (UTC)', () => {
    const at = new Date('2026-10-21T15:30:00Z'); // a Wednesday
    assert.equal(periodStart(at, 'day').toISOString(), '2026-10-21T00:00:00.000Z');
    assert.equal(periodStart(at, 'week').toISOString(), '2026-10-19T00:00:00.000Z');
    assert.equal(periodStart(at, 'month').toISOString(), '2026-10-01T00:00:00.000Z');
    assert.equal(periodStart(new Date('2026-10-18T10:00:00Z'), 'week').toISOString(), '2026-10-12T00:00:00.000Z'); // Sunday
  });

  await check('retries come after 1, 6 and 24 hours and then stop', () => {
    const now = new Date('2026-10-19T00:00:00Z');
    assert.equal(retryAt(1, now)?.toISOString(), '2026-10-19T01:00:00.000Z');
    assert.equal(retryAt(2, now)?.toISOString(), '2026-10-19T06:00:00.000Z');
    assert.equal(retryAt(3, now)?.toISOString(), '2026-10-20T00:00:00.000Z');
    assert.equal(retryAt(4, now), null);
    assert.equal(MAX_ATTEMPTS, 4);
  });

  await check('schedule times: next day, weekday, month day, always after now', () => {
    const from = new Date('2026-10-19T08:00:00Z'); // Monday after the run hour
    assert.equal(nextRun(from, 'daily', null, null).toISOString(), '2026-10-20T06:00:00.000Z');
    assert.equal(nextRun(new Date('2026-10-19T02:00:00Z'), 'daily', null, null).toISOString(), '2026-10-19T06:00:00.000Z');
    assert.equal(nextRun(from, 'weekly', 1, null).toISOString(), '2026-10-26T06:00:00.000Z');
    assert.equal(nextRun(from, 'weekly', 5, null).toISOString(), '2026-10-23T06:00:00.000Z');
    assert.equal(nextRun(from, 'monthly', null, 15).toISOString(), '2026-11-15T06:00:00.000Z');
    assert.equal(nextRun(from, 'monthly', null, 25).toISOString(), '2026-10-25T06:00:00.000Z');
    assert.equal(nextRun(new Date('2026-12-30T10:00:00Z'), 'monthly', null, 1).toISOString(), '2027-01-01T06:00:00.000Z');
  });

  await check('the postings add up to zero and the money is accounted for at every step', () => {
    const p = payoutAmounts(m('100'), rules({ feeFixed: '1' }));
    const request = requestLegs(W, p);
    const paid = paidLegs(p);
    const back = creditBackLegs(W, p);
    const reversed = reversedLegs(W, p);
    for (const legs of [request, paid, back, reversed]) assertValidLegs(legs);
    assert.equal(balanceOf(request, W, 'available').toDbString(), '-100.0000');
    assert.equal(sum(request, 'payout_in_transit'), '99.0000');
    assert.equal(sum(request, 'platform_fee_revenue'), '1.0000');
    // request then credit back leaves nothing anywhere
    for (const account of ['available', 'payout_in_transit', 'platform_fee_revenue'] as const)
      assert.equal(sum([...request, ...back], account), '0.0000');
    // request then paid leaves the net in clearing, the fee with the platform, nothing in transit
    assert.equal(sum([...request, ...paid], 'payout_in_transit'), '0.0000');
    assert.equal(sum([...request, ...paid], 'clearing'), '99.0000');
    // request, paid, reversed returns everything to the wallet
    assert.equal(sum([...request, ...paid, ...reversed], 'clearing'), '0.0000');
    assert.equal(balanceOf([...request, ...paid, ...reversed], W, 'available').toDbString(), '0.0000');
    assertValidLegs(requestLegs(W, payoutAmounts(m('100'), rules())));
  });

  await check('payout settings are strict and limited', () => {
    assert.ok(payoutSettingsInput.safeParse({ minAmount: '25', feePercent: '1.5', periodUnit: 'week' }).success);
    assert.ok(payoutSettingsInput.safeParse({ minAmount: null }).success);
    assert.ok(!payoutSettingsInput.safeParse({ feePercent: '25' }).success);
    assert.ok(!payoutSettingsInput.safeParse({ minAmount: '0' }).success);
    assert.ok(!payoutSettingsInput.safeParse({ periodUnit: 'year' }).success);
    assert.ok(!payoutSettingsInput.safeParse({ other: 1 }).success);
  });

  await check('payout method input is strict, plain text and never echoes the account number as a hint', () => {
    const ok = {
      kind: 'bank_transfer',
      label: 'Main bank',
      holderName: 'Asha Rahman',
      accountNumber: 'GB29 NWBK 6016 1331 9268 19',
      bankName: 'First Bank',
    };
    assert.ok(methodInput.safeParse(ok).success);
    assert.ok(!methodInput.safeParse({ ...ok, label: '<b>x</b>' }).success);
    assert.ok(!methodInput.safeParse({ ...ok, accountNumber: '12' }).success);
    assert.ok(!methodInput.safeParse({ ...ok, swiftCode: 'ABC' }).success);
    assert.ok(!methodInput.safeParse({ ...ok, extra: 'x' }).success);
    assert.equal(methodInput.parse(ok).currency, 'USD');
  });

  await check('only the manual partner exists and it needs a person to finish a payout', async () => {
    assert.deepEqual(listPartners().map((p) => p.id), ['manual']);
    const manual = getPartner('manual');
    assert.ok(manual && !manual.automatic);
    const answer = await manual.submit({ payoutId: W, net: '99', currency: 'USD', localAmount: null, methodId: W, attempt: 1 });
    assert.deepEqual(answer, { kind: 'accepted', reference: null, completed: false });
    assert.equal(getPartner('unknown'), null);
  });

  process.stdout.write(`step14-payouts: ${checks} checks passed\n`);
}

void main();
