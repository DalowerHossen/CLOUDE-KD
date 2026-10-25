// path: scripts/verify/step16-modules.ts
// Checks of the optional modules: every menu item of an owner is core or in a module (so nothing slips through when the
// modules are off), paths map to the right module, flags resolve as agreed (off by default, company beats global,
// rollout is stable), the sign-up trial settings are sane, and the profile input rules hold.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-modules.ts
import assert from 'node:assert/strict';
import {
  CORE_NAV_IDS,
  MODULES,
  moduleForApi,
  moduleForPage,
  moduleOfNavItem,
} from '@/config/features';
import { navMap } from '@/config/nav-map';
import { PLAN_KEYS } from '@/config/plans';
import { SIGNUP_TRIAL_DAYS, SIGNUP_TRIAL_PLAN } from '@/config/trial';
import { bucketOf, enabledKeys, type FlagRow } from '@/lib/features/rules';
import { profileInput } from '@/lib/profile/schema';

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

const ids = new Set(navMap.map((i) => i.id));

check('core and module ids exist and no id is in two places', () => {
  const seen = new Set<string>();
  for (const id of CORE_NAV_IDS) {
    assert.ok(ids.has(id), `unknown core id ${id}`);
    assert.ok(!seen.has(id), `twice: ${id}`);
    seen.add(id);
  }
  for (const m of MODULES)
    for (const id of m.navIds) {
      assert.ok(ids.has(id), `unknown module id ${id}`);
      assert.ok(!seen.has(id), `twice: ${id}`);
      seen.add(id);
    }
});

check('every owner menu item is core or in a module', () => {
  for (const item of navMap) {
    if (item.group !== 'dashboard' && item.group !== 'account') continue;
    if (item.roles !== 'any' && !item.roles.includes('owner') && !item.roles.includes('staff'))
      continue;
    assert.ok(
      CORE_NAV_IDS.includes(item.id) || moduleOfNavItem(item.id) !== null,
      `not covered: ${item.id}`,
    );
  }
});

check('module keys are valid flag keys and unique', () => {
  const keys = MODULES.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.match(k, /^module\.[a-z][a-z0-9_]*$/);
});

check('the pages of a module map to it and the menu paths match', () => {
  for (const m of MODULES)
    for (const id of m.navIds) {
      const item = navMap.find((i) => i.id === id);
      if (item?.group === 'dashboard' || item?.group === 'account')
        assert.equal(moduleForPage(item.href)?.key, m.key, `${id} ${item.href}`);
    }
});

check('page paths: specific beats general, core stays core', () => {
  assert.equal(moduleForPage('/developers/keys/abc')?.key, 'module.developers');
  assert.equal(moduleForPage('/invoices/recurring')?.key, 'module.invoicing_extras');
  assert.equal(moduleForPage('/invoices'), null);
  assert.equal(moduleForPage('/invoices/123'), null);
  assert.equal(moduleForPage('/wallet'), null);
  assert.equal(moduleForPage('/wallet/bnpl/x')?.key, 'module.bnpl');
  assert.equal(moduleForPage('/subscriptions/billing'), null);
  assert.equal(moduleForPage('/subscriptions/billing/invoices/1'), null);
  assert.equal(moduleForPage('/subscriptions/plans')?.key, 'module.client_subscriptions');
  assert.equal(moduleForPage('/settings/company'), null);
  assert.equal(moduleForPage('/settings/security')?.key, 'module.advanced_settings');
  assert.equal(moduleForPage('/account/security'), null);
  assert.equal(moduleForPage('/developersx'), null);
});

check('API paths: only module-exclusive paths are gated', () => {
  assert.equal(moduleForApi('/api/integrations/keys')?.key, 'module.developers');
  assert.equal(
    moduleForApi('/api/integrations/webhooks/1/rotate-secret')?.key,
    'module.developers',
  );
  assert.equal(moduleForApi('/api/integrations/gateway/upstream')?.key, 'module.gateway');
  assert.equal(moduleForApi('/api/integrations/settlement/entries')?.key, 'module.settlement');
  assert.equal(moduleForApi('/api/accounting/journals')?.key, 'module.accounting');
  assert.equal(moduleForApi('/api/reports/dashboard'), null);
  assert.equal(moduleForApi('/api/approvals'), null);
  assert.equal(moduleForApi('/api/invoices'), null);
  assert.equal(moduleForApi('/api/payments'), null);
  assert.equal(moduleForApi('/api/gateway/v1/orders'), null);
  assert.equal(moduleForApi('/api/auth/logout'), null);
});

const row = (r: Partial<FlagRow> & Pick<FlagRow, 'key'>): FlagRow => ({
  companyId: null,
  enabled: true,
  rolloutPercent: 100,
  ...r,
});
const C = '0192f1a0-0000-7000-8000-000000000001';
const KEYS = ['module.a', 'module.b'];

check('no flag means off', () => {
  assert.equal(enabledKeys([], C, KEYS).size, 0);
});

check('a global flag turns a module on for everyone', () => {
  assert.deepEqual([...enabledKeys([row({ key: 'module.a' })], C, KEYS)], ['module.a']);
});

check('a company flag beats the global flag in both directions', () => {
  const off = enabledKeys(
    [row({ key: 'module.a' }), row({ key: 'module.a', companyId: C, enabled: false })],
    C,
    KEYS,
  );
  assert.equal(off.size, 0);
  const on = enabledKeys(
    [row({ key: 'module.b', enabled: false }), row({ key: 'module.b', companyId: C })],
    C,
    KEYS,
  );
  assert.deepEqual([...on], ['module.b']);
});

check('the flag of another company does not count', () => {
  const other = '0192f1a0-0000-7000-8000-000000000002';
  assert.equal(enabledKeys([row({ key: 'module.a', companyId: other })], C, KEYS).size, 0);
});

check('rollout: 0 is off, 100 is on, and a bucket is stable and in range', () => {
  assert.equal(enabledKeys([row({ key: 'module.a', rolloutPercent: 0 })], C, KEYS).size, 0);
  assert.equal(enabledKeys([row({ key: 'module.a', rolloutPercent: 100 })], C, KEYS).size, 1);
  const b = bucketOf(C, 'module.a');
  assert.ok(b >= 0 && b <= 99);
  assert.equal(b, bucketOf(C, 'module.a'));
  const half = enabledKeys([row({ key: 'module.a', rolloutPercent: b })], C, KEYS).size;
  const above = enabledKeys([row({ key: 'module.a', rolloutPercent: b + 1 })], C, KEYS).size;
  assert.equal(half, 0);
  assert.equal(above, 1);
});

check('the sign-up trial uses a plan that exists and a sane length', () => {
  assert.ok((PLAN_KEYS as readonly string[]).includes(SIGNUP_TRIAL_PLAN));
  assert.ok(SIGNUP_TRIAL_DAYS >= 1 && SIGNUP_TRIAL_DAYS <= 90);
});

check('profile input accepts a good value and refuses bad ones', () => {
  const ok = { fullName: 'Dalower Hossen', timezone: 'Asia/Dhaka', expectedVersion: 1 };
  assert.ok(profileInput.safeParse(ok).success);
  assert.ok(!profileInput.safeParse({ ...ok, fullName: 'A' }).success);
  assert.ok(!profileInput.safeParse({ ...ok, fullName: '<b>x</b>' }).success);
  assert.ok(!profileInput.safeParse({ ...ok, timezone: 'Mars/Base' }).success);
  assert.ok(!profileInput.safeParse({ ...ok, expectedVersion: 0 }).success);
  assert.ok(!profileInput.safeParse({ ...ok, extra: 1 }).success);
});

process.stdout.write(`step16-modules: ${checks} checks passed\n`);
