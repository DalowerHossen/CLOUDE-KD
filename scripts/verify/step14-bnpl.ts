// path: scripts/verify/step14-bnpl.ts
// Logic checks of the installment rules (14.9) that need no database: the settings input, who is offered installments,
// the offers (parts add up, fee is for the seller only), late parts and the outcome of a plan. The one plan per invoice is
// checked in the database by sql/assertions/s14_009_bnpl.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step14-bnpl.ts
import assert from 'node:assert/strict';
import {
  BUILT_IN_BNPL,
  addDays,
  bnplFormInput,
  bnplSettingsInput,
  eligibility,
  formToSettings,
  missedParts,
  offers,
  planOutcome,
  type BnplRules,
  type EligibilityFacts,
} from '@/lib/payment/bnpl-rules';
import { installmentStatuses, splitInstallments } from '@/lib/schedule/installments';
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
const on: BnplRules = { ...BUILT_IN_BNPL, platformEnabled: true, companyEnabled: true };
const facts = (over: Partial<EligibilityFacts> = {}): EligibilityFacts => ({
  invoiceStatus: 'sent',
  amountDue: '600',
  amountPaid: '0',
  hasLivePlan: false,
  paidInvoices: 2,
  overdueInvoices: 0,
  riskFlag: 'none',
  ...over,
});

check('settings input is strict and limited', () => {
  assert.ok(bnplSettingsInput.safeParse({ enabled: true, terms: [3, 6] }).success);
  assert.ok(
    !bnplSettingsInput.safeParse({ terms: [5] }).success,
    'only the allowed numbers of parts',
  );
  assert.ok(!bnplSettingsInput.safeParse({ feePercentByTerm: { '3': '31' } }).success);
  assert.ok(!bnplSettingsInput.safeParse({ minAmount: '100', maxAmount: '50' }).success);
  assert.ok(!bnplSettingsInput.safeParse({ extra: 1 }).success);
  const form = bnplFormInput.parse({
    terms: ['3', '6'],
    feeList: ['3=1.5', '6=2.5'],
    enabled: true,
  });
  assert.deepEqual(formToSettings(form), {
    enabled: true,
    terms: [3, 6],
    feePercentByTerm: { '3': '1.5', '6': '2.5' },
  });
  assert.ok(!bnplFormInput.safeParse({ terms: ['x'] }).success);
});

check('installments are offered only when every rule is met', () => {
  assert.ok(eligibility(facts(), on).eligible);
  assert.ok(!eligibility(facts(), { ...on, platformEnabled: false }).eligible);
  assert.ok(!eligibility(facts(), { ...on, companyEnabled: false }).eligible);
  assert.ok(!eligibility(facts({ invoiceStatus: 'draft' }), on).eligible);
  assert.ok(!eligibility(facts({ invoiceStatus: 'paid' }), on).eligible);
  assert.ok(!eligibility(facts({ amountPaid: '10' }), on).eligible);
  assert.ok(!eligibility(facts({ hasLivePlan: true }), on).eligible);
  assert.ok(!eligibility(facts({ amountDue: '20' }), on).eligible, 'below the smallest invoice');
  assert.ok(!eligibility(facts({ amountDue: '9000' }), on).eligible, 'above the largest invoice');
  assert.ok(!eligibility(facts({ riskFlag: 'high' }), on).eligible);
  assert.ok(eligibility(facts({ riskFlag: 'watch' }), on).eligible);
  assert.ok(!eligibility(facts({ overdueInvoices: 1 }), on).eligible);
  assert.ok(
    !eligibility(facts({ paidInvoices: 0 }), on).eligible,
    'a new client needs a paid invoice first',
  );
  assert.ok(eligibility(facts({ paidInvoices: 0 }), { ...on, minPaidInvoices: 0 }).eligible);
  assert.ok(eligibility(facts({ invoiceStatus: 'overdue' }), on).eligible);
});

check("offers: parts add up, the client pays nothing extra, the fee is the seller's", () => {
  const priced: BnplRules = { ...on, feePercentByTerm: { '3': '1.5', '6': '2.5', '12': '4' } };
  const list = offers('600', priced, '2026-11-01');
  assert.deepEqual(
    list.map((o) => o.terms),
    [3, 6, 12],
  );
  for (const o of list) {
    const sum = o.rows.reduce((s, r) => s.add(r.amount), Money.zero());
    assert.equal(sum.toDbString(), '600.0000');
    assert.equal(o.clientTotal, '600.0000');
    assert.equal(o.rows.length, o.terms);
  }
  assert.equal(list[0]?.sellerFee, '9.0000');
  assert.equal(list[1]?.sellerFee, '15.0000');
  assert.equal(list[2]?.sellerFee, '24.0000');
  const odd = offers('100.01', on, '2026-11-01')[0];
  assert.equal(odd?.rows.reduce((s, r) => s.add(r.amount), Money.zero()).toDbString(), '100.0100');
  assert.equal(list[0]?.rows[1]?.dueDate, '2026-12-01');
});

check('a term whose part would be tiny is not offered', () => {
  const list = offers('60', on, '2026-11-01');
  assert.deepEqual(
    list.map((o) => o.terms),
    [3, 6],
    '12 parts of 5 are below the smallest part',
  );
});

check(
  'a late part counts after the grace days, and the plan ends in default after too many',
  () => {
    const rows = splitInstallments({
      total: '300',
      count: 3,
      firstDue: '2026-11-01',
      unit: 'month',
      every: 1,
      downPaymentPercent: '0',
    });
    const at = (paid: string, today: string): ReturnType<typeof installmentStatuses> =>
      installmentStatuses(rows, paid, today);
    assert.equal(missedParts(at('0', '2026-11-03'), '2026-11-03', 3), 0, 'inside the grace days');
    assert.equal(missedParts(at('0', '2026-11-05'), '2026-11-05', 3), 1);
    assert.equal(
      planOutcome({
        statuses: at('100', '2026-12-10'),
        today: '2026-12-10',
        graceDays: 3,
        missedLimit: 2,
      }).outcome,
      'active',
    );
    assert.equal(
      planOutcome({
        statuses: at('0', '2026-12-10'),
        today: '2026-12-10',
        graceDays: 3,
        missedLimit: 2,
      }).outcome,
      'defaulted',
    );
    assert.equal(
      planOutcome({
        statuses: at('300', '2027-02-01'),
        today: '2027-02-01',
        graceDays: 3,
        missedLimit: 2,
      }).outcome,
      'completed',
    );
    assert.equal(
      planOutcome({ statuses: [], today: '2026-12-10', graceDays: 3, missedLimit: 2 }).outcome,
      'active',
    );
    assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  },
);

process.stdout.write(`step14-bnpl: ${checks} checks passed\n`);
