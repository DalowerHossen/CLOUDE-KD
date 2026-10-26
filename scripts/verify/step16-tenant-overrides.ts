// path: scripts/verify/step16-tenant-overrides.ts
// Custom limits per company: input rules by kind of feature, the way an override lies over the plan, expiry, and the plan map
// staying untouched.
// Run: SKIP_ENV_VALIDATION=1 npx tsx scripts/verify/step16-tenant-overrides.ts
import assert from 'node:assert/strict';
import { applyOverrides, tenantOverrideSchema } from '@/lib/platform/tenant-overrides';

const company = '0192f0a0-0000-7000-8000-000000000001';
const base = { companyId: company, reason: 'Agreed in the enterprise deal', expiresAt: null };
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
const ok = (v: unknown): boolean => tenantOverrideSchema.safeParse(v).success;

check('a limit takes a number or null, a switch takes a boolean', () => {
  assert.ok(ok({ action: 'set', ...base, key: 'clients.max', value: 5000 }));
  assert.ok(ok({ action: 'set', ...base, key: 'clients.max', value: null }));
  assert.ok(!ok({ action: 'set', ...base, key: 'clients.max', value: true }));
  assert.ok(ok({ action: 'set', ...base, key: 'api.access', value: true }));
  assert.ok(!ok({ action: 'set', ...base, key: 'api.access', value: 5 }));
  assert.ok(!ok({ action: 'set', ...base, key: 'api.access', value: null }));
});
check(
  'unknown features, negative or fractional numbers, short reasons and extra fields are refused',
  () => {
    assert.ok(!ok({ action: 'set', ...base, key: 'nonsense.key', value: 1 }));
    assert.ok(!ok({ action: 'set', ...base, key: 'clients.max', value: -1 }));
    assert.ok(!ok({ action: 'set', ...base, key: 'clients.max', value: 1.5 }));
    assert.ok(!ok({ action: 'set', ...base, key: 'clients.max', value: 5, reason: 'short' }));
    assert.ok(
      !ok({
        action: 'set',
        ...base,
        key: 'clients.max',
        value: 5,
        reason: '<b>Agreed in the deal</b>',
      }),
    );
    assert.ok(!ok({ action: 'set', ...base, key: 'clients.max', value: 5, extra: 1 }));
    assert.ok(ok({ action: 'clear', companyId: company, key: 'clients.max' }));
    assert.ok(!ok({ action: 'clear', companyId: 'x', key: 'clients.max' }));
  },
);
check('an override lies over the plan and the plan map is not changed', () => {
  const plan = { 'clients.max': 100, 'api.access': false, 'staff.seats': 3 };
  const merged = applyOverrides(plan, [
    { key: 'clients.max', value: 5000, expiresAt: null },
    { key: 'api.access', value: true, expiresAt: null },
  ]);
  assert.equal(merged['clients.max'], 5000);
  assert.equal(merged['api.access'], true);
  assert.equal(merged['staff.seats'], 3);
  assert.equal(plan['clients.max'], 100);
  assert.equal(plan['api.access'], false);
});
check('no limit (null) is an override too', () => {
  const merged = applyOverrides({ 'storage.gigabytes': 5 }, [
    { key: 'storage.gigabytes', value: null, expiresAt: null },
  ]);
  assert.equal(merged['storage.gigabytes'], null);
});
check('an override that has run out is ignored', () => {
  const rows = [{ key: 'clients.max', value: 5000, expiresAt: '2026-10-27T00:00:00Z' }];
  assert.equal(
    applyOverrides({ 'clients.max': 100 }, rows, new Date('2026-10-26T00:00:00Z'))['clients.max'],
    5000,
  );
  assert.equal(
    applyOverrides({ 'clients.max': 100 }, rows, new Date('2026-10-27T00:00:00Z'))['clients.max'],
    100,
  );
});

process.stdout.write(`step16-tenant-overrides: ${checks} checks passed\n`);
