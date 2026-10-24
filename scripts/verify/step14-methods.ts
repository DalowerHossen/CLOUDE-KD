// path: scripts/verify/step14-methods.ts
// Logic checks of the payment method catalogue and the layers on top of it (14.4) that need no database: the catalogue
// carries no brand names, a method that the platform has not switched on cannot be on, the plan rules, the plan limit,
// the order and the words. The table rules are checked by sql/assertions/s14_004_payment_methods.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step14-methods.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { METHODS_PER_PLAN, PAYMENT_METHODS } from '@/config/payment-methods';
import {
  planAtLeast,
  planMethodLimit,
  resolveMethods,
  switchOnProblem,
  type CompanyRow,
  type PlatformRow,
} from '@/lib/payment/payment-methods';
import { companyChoiceInput, platformMethodInput } from '@/services/payout/payment-methods';

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

const on = (
  methodCode: string,
  country: string | null,
  extra: Partial<PlatformRow> = {},
): PlatformRow => ({
  methodCode,
  country,
  enabled: true,
  sortOrder: null,
  feeModel: null,
  instructions: null,
  minPlan: null,
  ...extra,
});
const mine = (
  methodCode: string,
  enabled: boolean,
  extra: Partial<CompanyRow> = {},
): CompanyRow => ({
  methodCode,
  enabled,
  sortOrder: null,
  instructions: null,
  ...extra,
});

check('the catalogue has generic names only and well-formed entries', () => {
  const text = readFileSync('config/payment-methods.ts', 'utf8');
  assert.ok(
    !/bkash|nagad|gcash|upi|promptpay|paynow|alipay|wechat|duitnow|momo|gopay|paypay|kakaopay|grabpay|truemoney/i.test(
      text,
    ),
  );
  const codes = PAYMENT_METHODS.map((m) => m.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const m of PAYMENT_METHODS) {
    assert.match(m.code, /^[a-z][a-z0-9_]{1,40}$/);
    assert.ok(m.countries.length > 0 && m.countries.every((c) => /^[A-Z]{2}$/.test(c)));
    assert.ok(m.label.length > 0 && m.instructions.length <= 500);
  }
});

check(
  'only methods of the country are listed, and none is on until the platform and the owner say so',
  () => {
    const none = resolveMethods({
      country: 'BD',
      planKey: 'enterprise',
      platform: [],
      company: [mine('card', true)],
    });
    assert.ok(none.length > 0 && none.every((m) => m.code !== 'instant_bank_qr'));
    assert.ok(
      none.every((m) => !m.enabled),
      'a method the platform has not switched on is never on',
    );
    assert.ok(
      resolveMethods({ country: null, planKey: 'free', platform: [], company: [] }).length === 0,
    );
  },
);

check('platform rows: the country row wins over the all-countries row', () => {
  const rows = [on('mobile_wallet_a', null), on('mobile_wallet_a', 'BD', { enabled: false })];
  const bd = resolveMethods({
    country: 'BD',
    planKey: 'pro',
    platform: rows,
    company: [mine('mobile_wallet_a', true)],
  }).find((m) => m.code === 'mobile_wallet_a');
  assert.equal(bd?.platformEnabled, false);
  assert.equal(bd?.enabled, false);
  const pk = resolveMethods({
    country: 'PK',
    planKey: 'pro',
    platform: rows,
    company: [mine('mobile_wallet_a', true)],
  }).find((m) => m.code === 'mobile_wallet_a');
  assert.equal(pk?.platformEnabled, true);
  assert.equal(pk?.enabled, true);
});

check(
  'the plan decides: lower plans cannot use a method, the platform can change the lowest plan',
  () => {
    assert.ok(
      planAtLeast('pro', 'free') && planAtLeast('pro', 'pro') && !planAtLeast('free', 'pro'),
    );
    assert.ok(!planAtLeast('custom_plan', 'free'));
    const rows = [on('mobile_wallet_a', 'BD')];
    const free = resolveMethods({
      country: 'BD',
      planKey: 'free',
      platform: rows,
      company: [mine('mobile_wallet_a', true)],
    }).find((m) => m.code === 'mobile_wallet_a');
    assert.equal(free?.planAllows, false);
    assert.equal(free?.enabled, false);
    const relaxed = [on('mobile_wallet_a', 'BD', { minPlan: 'free' })];
    const ok = resolveMethods({
      country: 'BD',
      planKey: 'free',
      platform: relaxed,
      company: [mine('mobile_wallet_a', true)],
    }).find((m) => m.code === 'mobile_wallet_a');
    assert.equal(ok?.enabled, true);
  },
);

check('the plan limit is enforced when switching on', () => {
  assert.equal(planMethodLimit('free'), METHODS_PER_PLAN.free);
  assert.equal(planMethodLimit('enterprise'), null);
  assert.equal(planMethodLimit('unknown_plan'), METHODS_PER_PLAN.free);
  const platform = [
    on('card', null),
    on('bank_transfer_local', null),
    on('mobile_wallet_a', null, { minPlan: 'free' }),
  ];
  const methods = resolveMethods({
    country: 'BD',
    planKey: 'free',
    platform,
    company: [mine('card', true), mine('bank_transfer_local', true)],
  });
  assert.match(String(switchOnProblem(methods, 'mobile_wallet_a', 'free', 2)), /allows 2/);
  assert.equal(
    switchOnProblem(methods, 'card', 'free', 2),
    null,
    'a method already on is not blocked',
  );
  assert.equal(switchOnProblem(methods, 'mobile_wallet_a', 'free', null), null);
  assert.match(
    String(switchOnProblem(methods, 'instant_bank_qr', 'free', 2)),
    /not offered in your country/,
  );
  assert.match(String(switchOnProblem(methods, 'local_qr_code', 'free', 2)), /not offered/);
  const off = resolveMethods({ country: 'BD', planKey: 'free', platform: [], company: [] });
  assert.match(String(switchOnProblem(off, 'card', 'free', 2)), /not available yet/);
});

check(
  'order and words: the owner overrides the platform, the platform overrides the catalogue',
  () => {
    const platform = [
      on('card', null, { sortOrder: 20, instructions: 'Platform words' }),
      on('bank_transfer_local', null, { sortOrder: 10 }),
    ];
    const first = resolveMethods({
      country: 'BD',
      planKey: 'free',
      platform,
      company: [mine('card', true), mine('bank_transfer_local', true)],
    });
    assert.deepEqual(
      first.filter((m) => m.enabled).map((m) => m.code),
      ['bank_transfer_local', 'card'],
    );
    assert.equal(first.find((m) => m.code === 'card')?.instructions, 'Platform words');
    const second = resolveMethods({
      country: 'BD',
      planKey: 'free',
      platform,
      company: [
        mine('card', true, { sortOrder: 1, instructions: 'My words' }),
        mine('bank_transfer_local', true),
      ],
    });
    assert.deepEqual(
      second.filter((m) => m.enabled).map((m) => m.code),
      ['card', 'bank_transfer_local'],
    );
    assert.equal(second.find((m) => m.code === 'card')?.instructions, 'My words');
  },
);

check('inputs are strict and plain', () => {
  assert.ok(companyChoiceInput.safeParse({ code: 'card', enabled: true }).success);
  assert.ok(companyChoiceInput.safeParse({ code: 'card', instructions: 'Pay now.' }).success);
  assert.ok(!companyChoiceInput.safeParse({ code: 'Card', enabled: true }).success);
  assert.ok(!companyChoiceInput.safeParse({ code: 'card', instructions: '<b>x</b>' }).success);
  assert.ok(!companyChoiceInput.safeParse({ code: 'card', apiKey: 'x' }).success);
  assert.ok(
    platformMethodInput.safeParse({ code: 'card', country: 'BD', enabled: true, minPlan: 'pro' })
      .success,
  );
  assert.ok(!platformMethodInput.safeParse({ code: 'card', country: 'bd', enabled: true }).success);
  assert.ok(
    !platformMethodInput.safeParse({ code: 'card', enabled: true, minPlan: 'gold' }).success,
  );
});

process.stdout.write(`step14-methods: ${checks} checks passed\n`);
