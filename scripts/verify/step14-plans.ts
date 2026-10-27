// path: scripts/verify/step14-plans.ts
// Logic checks of plans and entitlements (14.5) that need no database: which keys are switches or limits, plan and
// feature input, the layering of saved values over the built-in ones (a plan change is answered at once, a plan that is
// not saved still answers from the built-in catalogue), quota bars, the plan to offer for a locked feature and what a
// downgrade leaves over the limit. The table rules are checked by sql/assertions/s14_005_plans.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step14-plans.ts
import assert from 'node:assert/strict';
import { ENTITLEMENT_KEYS, PLANS } from '@/config/plans';
import {
  baseEntitlements,
  downgradeImpact,
  entitlementsInput,
  hasValue,
  keyKind,
  mergeEntitlements,
  meter,
  planInput,
  planUpdateInput,
  upgradeTarget,
  type PlanLike,
} from '@/lib/payment/plan-rules';
import { invalidatePlanCache, cached } from '@/services/entitlement/cache';

let checks = 0;
const check = async (name: string, fn: () => void | Promise<void>): Promise<void> => {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

const plan = (
  slug: string,
  sortOrder: number,
  e: Record<string, boolean | number | null>,
  status: 'active' | 'archived' = 'active',
): PlanLike => ({
  slug,
  name: slug.toUpperCase(),
  sortOrder,
  status,
  entitlements: { ...baseEntitlements('free'), ...e },
});

async function main(): Promise<void> {
  await check('every built-in key is a switch or a limit, and the kinds match the values', () => {
    for (const key of ENTITLEMENT_KEYS) {
      const kind = keyKind(key);
      for (const def of Object.values(PLANS)) {
        const v = def.entitlements[key];
        assert.equal(typeof v === 'boolean', kind === 'switch', `${def.key}/${key}`);
      }
    }
    assert.equal(keyKind('invoices.monthly'), 'limit');
    assert.equal(keyKind('api.access'), 'switch');
    assert.equal(keyKind('unknown.key'), 'limit');
  });

  await check('plan input is strict, plain and limited', () => {
    assert.ok(
      planInput.safeParse({ slug: 'starter', name: 'Starter', priceMonthly: '19', trialDays: 14 })
        .success,
    );
    assert.ok(!planInput.safeParse({ slug: 'Starter', name: 'x' }).success);
    assert.ok(!planInput.safeParse({ slug: 'starter', name: '<b>x</b>' }).success);
    assert.ok(!planInput.safeParse({ slug: 'starter', name: 'x', priceMonthly: '-1' }).success);
    assert.ok(!planInput.safeParse({ slug: 'starter', name: 'x', trialDays: 100 }).success);
    assert.ok(!planInput.safeParse({ slug: 'starter', name: 'x', other: 1 }).success);
    assert.ok(planUpdateInput.safeParse({ priceMonthly: '29' }).success);
    assert.ok(!planUpdateInput.safeParse({ slug: 'renamed' }).success, 'the slug never changes');
    assert.equal(planInput.parse({ slug: 'starter', name: 'S' }).visible, false);
  });

  await check(
    'the admin form sends empty boxes as null: no description and no badge are accepted',
    () => {
      const form = {
        name: 'Pro',
        description: null,
        priceMonthly: '19.99',
        priceYearly: '199.99',
        seatPriceMonthly: '39.89',
        trialDays: 7,
        sortOrder: 20,
        badge: null,
        visible: true,
      };
      const parsed = planUpdateInput.safeParse(form);
      assert.ok(parsed.success);
      assert.equal(parsed.data.description, '');
    },
  );

  await check('feature input: switches are on or off, limits are numbers or no limit', () => {
    assert.ok(
      entitlementsInput.safeParse({
        values: { 'api.access': true, 'clients.max': 100, 'staff.seats': null },
      }).success,
    );
    assert.ok(!entitlementsInput.safeParse({ values: { 'api.access': 5 } }).success);
    assert.ok(!entitlementsInput.safeParse({ values: { 'clients.max': true } }).success);
    assert.ok(!entitlementsInput.safeParse({ values: { 'clients.max': -1 } }).success);
    assert.ok(!entitlementsInput.safeParse({ values: { 'Bad Key': 1 } }).success);
    assert.ok(!entitlementsInput.safeParse({ values: {}, extra: 1 }).success);
    assert.ok(
      entitlementsInput.safeParse({ values: {}, overage: { 'invoices.monthly': '0.5' } }).success,
    );
  });

  await check(
    'saved values win over the built-in ones at once; a plan not saved answers from the built-in catalogue',
    () => {
      const before = mergeEntitlements('pro', []);
      assert.equal(before['invoices.monthly'], PLANS.pro.entitlements['invoices.monthly']);
      const after = mergeEntitlements('pro', [
        { key: 'invoices.monthly', value: 999 },
        { key: 'payroll.enabled', value: true },
      ]);
      assert.equal(after['invoices.monthly'], 999);
      assert.equal(after['payroll.enabled'], true);
      assert.equal(
        after['clients.max'],
        PLANS.pro.entitlements['clients.max'],
        'a key not saved keeps the built-in value',
      );
      assert.deepEqual(
        baseEntitlements('made_up_plan'),
        { ...PLANS.free.entitlements },
        'an unknown plan falls back to free',
      );
      assert.equal(
        mergeEntitlements('enterprise', [{ key: 'clients.max', value: 10 }])['clients.max'],
        10,
      );
      assert.ok(
        hasValue(null) &&
          hasValue(3) &&
          hasValue(true) &&
          !hasValue(0) &&
          !hasValue(false) &&
          !hasValue(undefined),
      );
    },
  );

  await check(
    'quota bars: ok under 80, warning from 80, blocked at 100, unlimited without a limit',
    () => {
      assert.deepEqual(meter(5, 10), { used: 5, limit: 10, percent: 50, state: 'ok' });
      assert.equal(meter(8, 10).state, 'warning');
      assert.equal(meter(10, 10).state, 'blocked');
      assert.equal(meter(15, 10).percent, 100);
      assert.equal(meter(7, null).state, 'unlimited');
      assert.equal(meter(0, 0).state, 'blocked');
    },
  );

  await check(
    'the paywall offers the first plan that opens the feature, never an archived one',
    () => {
      const plans = [
        plan('free', 10, { 'api.access': false, 'clients.max': 25 }),
        plan('gold', 20, { 'api.access': true, 'clients.max': 100 }, 'archived'),
        plan('pro', 30, { 'api.access': true, 'clients.max': 500 }),
        plan('enterprise', 40, { 'api.access': true, 'clients.max': null }),
      ];
      assert.equal(upgradeTarget(plans, 'free', 'api.access')?.slug, 'pro');
      assert.equal(upgradeTarget(plans, 'pro', 'api.access'), null, 'already open');
      assert.equal(upgradeTarget(plans, 'free', 'clients.max')?.slug, 'pro');
      assert.equal(upgradeTarget(plans, 'pro', 'clients.max')?.slug, 'enterprise');
      assert.equal(upgradeTarget(plans, 'enterprise', 'clients.max'), null);
    },
  );

  await check('a downgrade lists what is over the new limit and touches nothing', () => {
    const impact = downgradeImpact(
      { 'clients.max': 300, 'staff.seats': 1, 'invoices.monthly': 50 },
      mergeEntitlements('free', []),
    );
    assert.deepEqual(impact.map((i) => i.key).sort(), ['clients.max', 'invoices.monthly']);
    assert.deepEqual(
      downgradeImpact({ 'clients.max': 5 }, mergeEntitlements('enterprise', [])),
      [],
    );
  });

  await check('the plan cache keeps an answer briefly and a change clears it', async () => {
    invalidatePlanCache();
    let loads = 0;
    const load = async (): Promise<number> => ++loads;
    assert.equal(await cached('t', 'k', load), 1);
    assert.equal(await cached('t', 'k', load), 1);
    invalidatePlanCache();
    assert.equal(await cached('t', 'k', load), 2);
  });

  process.stdout.write(`step14-plans: ${checks} checks passed\n`);
}

void main();
