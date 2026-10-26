// path: scripts/verify/step16-plan-quotas.ts
// The e-mail and API quotas are plan features: every built-in plan carries both as numbers (or null for no limit), they show
// as quota bars, and the free plan has no API calls.
// Run: SKIP_ENV_VALIDATION=1 npx tsx scripts/verify/step16-plan-quotas.ts
import assert from 'node:assert/strict';
import { ENTITLEMENT_KEYS, PLANS } from '@/config/plans';
import { keyKind, meter, METERED_KEYS } from '@/lib/payment/plan-rules';

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

check('both keys exist, are limits and are metered', () => {
  for (const key of ['emails.monthly', 'api.requests_monthly'] as const) {
    assert.ok(ENTITLEMENT_KEYS.includes(key), key);
    assert.equal(keyKind(key), 'limit');
    assert.ok(METERED_KEYS.includes(key), key);
  }
});
check('every plan carries both, a number or null, growing with the plan', () => {
  const order = ['free', 'pro', 'business', 'enterprise'] as const;
  for (const slug of order)
    for (const key of ['emails.monthly', 'api.requests_monthly'] as const) {
      const v = PLANS[slug].entitlements[key];
      assert.ok(v === null || (typeof v === 'number' && v >= 0), `${slug}/${key}`);
    }
  for (const key of ['emails.monthly', 'api.requests_monthly'] as const) {
    const values = order.map((s) => PLANS[s].entitlements[key]);
    assert.equal(values[3], null, 'enterprise has no limit');
    assert.ok((values[0] as number) <= (values[1] as number));
    assert.ok((values[1] as number) <= (values[2] as number));
  }
});
check('the free plan has no API calls', () => {
  assert.equal(PLANS.free.entitlements['api.access'], false);
  assert.equal(PLANS.free.entitlements['api.requests_monthly'], 0);
});
check('the bars: ok, warning from 80 percent, reached at the limit, no bar without a limit', () => {
  assert.equal(meter(50, 100).state, 'ok');
  assert.equal(meter(80, 100).state, 'warning');
  assert.equal(meter(100, 100).state, 'blocked');
  assert.equal(meter(5, null).state, 'unlimited');
});

process.stdout.write(`step16-plan-quotas: ${checks} checks passed\n`);
