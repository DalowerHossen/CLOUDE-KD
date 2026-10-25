// path: scripts/verify/step16-owner-menu.ts
// Checks of the short owner menu and the personal profile rules: every listed id exists, the sub-merchant screens are
// not in the short menu, platform roles keep everything, and the profile input accepts and refuses the right values.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-owner-menu.ts
import assert from 'node:assert/strict';
import { essentialNavItems, visibleNavItems } from '@/components/layout/nav-utils';
import { ESSENTIAL_NAV_IDS } from '@/config/nav-essential';
import { navMap } from '@/config/nav-map';
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

check('every id of the short menu exists in the navigation map', () => {
  for (const id of ESSENTIAL_NAV_IDS) assert.ok(ids.has(id), `unknown id ${id}`);
});

check('the sub-merchant screens are not in the short menu', () => {
  assert.ok(!ESSENTIAL_NAV_IDS.includes('gateway'));
  assert.ok(!ESSENTIAL_NAV_IDS.includes('settlement'));
});

check('the owner short menu is shorter and still has the core screens', () => {
  const all = [
    ...visibleNavItems(navMap, 'dashboard', 'owner'),
    ...visibleNavItems(navMap, 'account', 'owner'),
  ];
  const short = essentialNavItems(all, ESSENTIAL_NAV_IDS, 'owner');
  assert.ok(short.length < all.length / 2, `${short.length} of ${all.length}`);
  const got = new Set(short.map((i) => i.id));
  for (const id of [
    'dashboard-home',
    'invoices',
    'settings-company',
    'settings-kyc',
    'team',
    'commerce',
    'developers',
    'account-profile',
  ])
    assert.ok(got.has(id), `missing ${id}`);
  assert.ok(!got.has('gateway') && !got.has('settlement') && !got.has('payroll-runs'));
});

check('staff only gets items that their role may see', () => {
  const staff = visibleNavItems(navMap, 'dashboard', 'staff');
  const short = essentialNavItems(staff, ESSENTIAL_NAV_IDS, 'staff');
  assert.ok(short.every((i) => staff.includes(i)));
  assert.ok(!short.some((i) => i.id === 'team'));
});

check('platform roles are not filtered', () => {
  const items = visibleNavItems(navMap, 'admin', 'super_admin');
  assert.equal(essentialNavItems(items, ESSENTIAL_NAV_IDS, 'super_admin').length, items.length);
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

process.stdout.write(`step16-owner-menu: ${checks} checks passed\n`);
