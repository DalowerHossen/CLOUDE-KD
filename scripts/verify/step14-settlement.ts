// path: scripts/verify/step14-settlement.ts
// Logic checks of the settlement rules (14.2) that need no database: the mode decision, hold periods, risk rules,
// reserve split, refund take-back, the legs of each posting and the settlement cycles. The database side is checked by
// sql/assertions/s14_002_settlement.sql, the ledger assertions and scripts/verify/step14-ledger.sh.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step14-settlement.ts
import assert from 'node:assert/strict';
import {
  BUILT_IN_RULES,
  chargebackLegs,
  cyclePeriod,
  decideMode,
  holdPlan,
  morSettingsInput,
  periodEnded,
  refundLegs,
  refundTakeBack,
  reserveLegs,
  scoreRisk,
  settlementLegs,
  splitReserve,
  type KycFacts,
  type MorRules,
} from '@/lib/payment/mor-engine';
import { DEFAULT_FEE_SCHEDULE, feeBreakdown } from '@/lib/payment/fee-calculator';
import { assertValidLegs, balanceOf } from '@/lib/payment/wallet';
import { Money } from '@/lib/utils/currency';

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

const W = '0192f1c0-0000-7000-8000-000000000001';
const m = (v: string): Money => Money.parse(v);
const rules = (over: Partial<MorRules> = {}): MorRules => ({ ...BUILT_IN_RULES, platformEnabled: true, ...over });
const kyc = (over: Partial<KycFacts> = {}): KycFacts => ({ status: 'approved', verified: true, expired: false, ...over });
const base = { platformEnabled: true, companyEnabled: true, suspended: false, kyc: kyc() };

check('the mode follows platform switch, company switch, suspension and KYC', () => {
  assert.equal(decideMode(base).mode, 'mor');
  assert.equal(decideMode({ ...base, platformEnabled: false }).reason, 'platform_off');
  assert.equal(decideMode({ ...base, platformEnabled: false }).mode, 'direct');
  assert.equal(decideMode({ ...base, companyEnabled: false }).reason, 'company_off');
  assert.equal(decideMode({ ...base, suspended: true }).mode, 'suspended');
  assert.equal(decideMode({ ...base, kyc: kyc({ status: 'not_submitted', verified: false }) }).reason, 'kyc_missing');
  assert.equal(decideMode({ ...base, kyc: kyc({ status: 'in_review', verified: false }) }).reason, 'kyc_pending');
  assert.equal(decideMode({ ...base, kyc: kyc({ status: 'rejected', verified: false }) }).reason, 'kyc_rejected');
  const ended = decideMode({ ...base, kyc: kyc({ status: 'not_submitted', verified: false, expired: true }) });
  assert.equal(ended.mode, 'suspended');
  assert.equal(ended.reason, 'kyc_expired');
  for (const reason of ['platform_off', 'kyc_missing', 'kyc_expired', 'suspended'] as const)
    assert.ok(!/bkash|nagad|upi/i.test(decideMode({ ...base, suspended: reason === 'suspended' }).message));
});

check('a new merchant is held longer and a high risk adds days', () => {
  assert.equal(holdPlan(rules(), { merchantAgeDays: 200, riskLevel: 'low' }).days, 7);
  assert.equal(holdPlan(rules(), { merchantAgeDays: 5, riskLevel: 'low' }).days, 14);
  assert.equal(holdPlan(rules(), { merchantAgeDays: 200, riskLevel: 'high' }).days, 14);
  assert.equal(holdPlan(rules({ riskExtensionDays: 0 }), { merchantAgeDays: 200, riskLevel: 'high' }).days, 7);
  assert.ok(holdPlan(rules(), { merchantAgeDays: 5, riskLevel: 'high' }).text.length <= 300);
  assert.ok(holdPlan(rules(), { merchantAgeDays: 5, riskLevel: 'low' }).text.includes('New merchant'));
});

check('risk rules add points and give levels', () => {
  const calm = { amount: m('50'), count24h: 3, amount24h: m('150'), disputes90d: 0, refundPercent90d: 0, merchantAgeDays: 300 };
  assert.deepEqual(scoreRisk(rules(), calm), { score: 0, level: 'low', reasons: [] });
  const r = rules({ largePayment: '1000', dailyLimit: '5000', velocityCount: 10 });
  const busy = scoreRisk(r, { ...calm, amount: m('1000'), count24h: 11, amount24h: m('6000') });
  assert.equal(busy.score, 90);
  assert.equal(busy.level, 'high');
  assert.equal(scoreRisk(r, { ...calm, disputes90d: 1 }).score, 20);
  assert.equal(scoreRisk(r, { ...calm, disputes90d: 3 }).score, 40);
  assert.equal(scoreRisk(r, { ...calm, disputes90d: 3 }).level, 'medium');
  assert.equal(scoreRisk(r, { ...calm, merchantAgeDays: 3, refundPercent90d: 25 }).score, 30);
});

check('the reserve is a share of what the company receives', () => {
  assert.deepEqual(
    [splitReserve(m('98'), '10').main.toDbString(), splitReserve(m('98'), '10').reserve.toDbString()],
    ['88.2000', '9.8000'],
  );
  assert.equal(splitReserve(m('98'), '0').reserve.toDbString(), '0.0000');
  assert.equal(splitReserve(Money.zero(), '10').reserve.toDbString(), '0.0000');
});

check('settlement, reserve, refund and chargeback postings add up to zero and keep the wallet right', () => {
  const fees = feeBreakdown(m('100'), DEFAULT_FEE_SCHEDULE, 'stripe');
  assert.equal(fees.totalFees.toDbString(), '2.0000');
  const { main, reserve } = splitReserve(fees.net, '10');
  const legs1 = settlementLegs({ walletId: W, main, fees: fees.totalFees, instant: false });
  const legs2 = reserveLegs(W, reserve);
  for (const l of [legs1, legs2]) assertValidLegs(l);
  const received = [...legs1, ...legs2];
  assert.equal(balanceOf(received, W, 'held').toDbString(), '98.0000');
  assert.equal(balanceOf(received, W, 'available').toDbString(), '0.0000');
  assert.equal(received.filter((l) => l.account === 'processor_receivable').reduce((a, l) => a.add(l.amount), Money.zero()).toDbString(), '-100.0000');
  assertValidLegs(settlementLegs({ walletId: W, main: m('98'), fees: m('2'), instant: true }));
  assertValidLegs(settlementLegs({ walletId: W, main: Money.zero(), fees: m('2'), instant: false }));
  const take = refundTakeBack({ gross: m('100'), fee: m('2'), refundedBefore: Money.zero(), feeReturnedBefore: Money.zero(), refund: m('25') });
  assert.equal(take.feeBack.toDbString(), '0.5000');
  assert.equal(take.companyDebit.toDbString(), '24.5000');
  assertValidLegs(refundLegs({ walletId: W, refund: m('25'), ...take }));
  assertValidLegs(chargebackLegs(W, m('98')));
});

check('refunds in parts return the whole fee once and never more', () => {
  const gross = m('100');
  const fee = m('2.3333');
  let before = Money.zero();
  let back = Money.zero();
  let debited = Money.zero();
  for (const part of ['33.3333', '33.3333', '33.3334']) {
    const t = refundTakeBack({ gross, fee, refundedBefore: before, feeReturnedBefore: back, refund: m(part) });
    before = before.add(part);
    back = back.add(t.feeBack);
    debited = debited.add(t.companyDebit);
  }
  assert.equal(back.toDbString(), '2.3333');
  assert.equal(debited.toDbString(), gross.sub(fee).toDbString());
  const over = refundTakeBack({ gross: m('10'), fee: m('1'), refundedBefore: m('9'), feeReturnedBefore: m('0.9'), refund: m('1') });
  assert.equal(over.feeBack.toDbString(), '0.1000');
});

check('settlement cycles line up and close only when over', () => {
  assert.deepEqual(cyclePeriod(new Date('2026-10-19T10:00:00Z'), 1), { start: '2026-10-19', end: '2026-10-19' });
  const w = cyclePeriod(new Date('2026-10-19T10:00:00Z'), 7);
  assert.equal(Date.parse(`${w.end}T00:00:00Z`) - Date.parse(`${w.start}T00:00:00Z`), 6 * 86_400_000);
  assert.equal(cyclePeriod(new Date(`${w.end}T23:00:00Z`), 7).start, w.start);
  assert.notEqual(cyclePeriod(new Date(`${w.end}T23:59:59Z`), 7).start, cyclePeriod(new Date(Date.parse(`${w.end}T23:59:59Z`) + 1000), 7).start);
  assert.equal(periodEnded('2026-10-19', new Date('2026-10-19T23:00:00Z')), false);
  assert.equal(periodEnded('2026-10-19', new Date('2026-10-20T00:00:01Z')), true);
});

check('settings input is strict and limited', () => {
  assert.ok(morSettingsInput.safeParse({ holdDays: 10, reservePercent: '5', cycleDays: 3, enabled: true }).success);
  assert.ok(morSettingsInput.safeParse({ holdDays: null }).success);
  assert.ok(!morSettingsInput.safeParse({ holdDays: 91 }).success);
  assert.ok(!morSettingsInput.safeParse({ cycleDays: 2 }).success);
  assert.ok(!morSettingsInput.safeParse({ reservePercent: '60' }).success);
  assert.ok(!morSettingsInput.safeParse({ dailyLimit: '-5' }).success);
  assert.ok(!morSettingsInput.safeParse({ unknown: 1 }).success);
});

process.stdout.write(`step14-settlement: ${checks} checks passed\n`);
