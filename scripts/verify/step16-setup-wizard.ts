// path: scripts/verify/step16-setup-wizard.ts
// The first-run wizard has eight steps in a fixed order; only the optional ones may be skipped; the reset request carries no
// choice; unknown steps and extra fields are refused; the database check list matches the step list.
// Run: SKIP_ENV_VALIDATION=1 npx tsx scripts/verify/step16-setup-wizard.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPTIONAL_WIZARD_STEPS, SETUP_STEPS, WIZARD_STEPS, setupSchema } from '@/lib/company/ops-input';

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

check('eight steps in the listed order', () => {
  assert.deepEqual(
    [...WIZARD_STEPS],
    ['branding', 'email', 'gateways', 'plans', 'domains', 'payouts', 'whatsapp', 'analytics'],
  );
});
check('every step is accepted as confirmed', () => {
  for (const step of WIZARD_STEPS) assert.ok(setupSchema.safeParse({ step, choice: 'confirmed' }).success, step);
});
check('skip is accepted by the schema for every step; the service limits it to the optional ones', () => {
  for (const step of WIZARD_STEPS) assert.ok(setupSchema.safeParse({ step, choice: 'skipped' }).success, step);
  assert.deepEqual([...OPTIONAL_WIZARD_STEPS].sort(), ['analytics', 'payouts', 'whatsapp']);
  for (const required of ['branding', 'email', 'gateways', 'plans', 'domains'] as const) {
    assert.ok(!OPTIONAL_WIZARD_STEPS.includes(required), required);
  }
});
check('reset, approval mode and the older security step', () => {
  assert.ok(setupSchema.safeParse({ step: 'reset' }).success);
  assert.ok(!setupSchema.safeParse({ step: 'reset', choice: 'confirmed' }).success);
  assert.ok(setupSchema.safeParse({ step: 'approval_mode', choice: 'team' }).success);
  assert.ok(setupSchema.safeParse({ step: 'security', choice: 'confirmed' }).success);
  assert.ok(!setupSchema.safeParse({ step: 'security', choice: 'skipped' }).success);
});
check('unknown steps, choices and extra fields are refused', () => {
  assert.ok(!setupSchema.safeParse({ step: 'payments', choice: 'confirmed' }).success);
  assert.ok(!setupSchema.safeParse({ step: 'email', choice: 'yes' }).success);
  assert.ok(!setupSchema.safeParse({ step: 'email', choice: 'confirmed', extra: 1 }).success);
});
check('the migration allows exactly the steps of the code', () => {
  const sql = readFileSync('migrations/S16_031_platform_setup_steps.sql', 'utf8');
  const listed = [...sql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(listed, [...SETUP_STEPS].sort());
});

process.stdout.write(`step16-setup-wizard: ${checks} checks passed\n`);
