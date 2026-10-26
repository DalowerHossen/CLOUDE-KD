// path: scripts/verify/step16-user-actions.ts
// Platform actions on a person: input rules (reason of 10 letters, e-mail and plan shape, no extra fields), the approval rules of
// the actions that need a second person, the two super admin only actions have none, and the migration allows exactly the
// actions of the code.
// Run: SKIP_ENV_VALIDATION=1 npx tsx scripts/verify/step16-user-actions.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DELETION_GRACE_DAYS, peopleActionSchema } from '@/lib/company/admin-input';
import { approvalRules } from '@/config/approval/s07-admin';

const id = '0192f0a0-0000-7000-8000-000000000001';
const reason = 'Customer asked by phone';
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
const ok = (v: unknown): boolean => peopleActionSchema.safeParse(v).success;

check('reason-only actions', () => {
  for (const action of [
    'user.soft_delete',
    'user.purge',
    'user.force_password_reset',
    'user.reset_2fa',
  ])
    assert.ok(ok({ action, id, reason }), action);
  assert.ok(!ok({ action: 'user.soft_delete', id, reason: 'short' }));
  assert.ok(!ok({ action: 'user.reset_2fa', id, reason, extra: 1 }));
  assert.ok(!ok({ action: 'user.reset_2fa', id: 'not-a-uuid', reason }));
});
check('e-mail change needs a valid address and is lower-cased', () => {
  assert.ok(ok({ action: 'user.change_email', id, reason, email: 'New@Example.com' }));
  const parsed = peopleActionSchema.parse({
    action: 'user.change_email',
    id,
    reason,
    email: 'New@Example.com',
  });
  assert.equal(parsed.action === 'user.change_email' && parsed.email, 'new@example.com');
  assert.ok(!ok({ action: 'user.change_email', id, reason, email: 'nope' }));
  assert.ok(!ok({ action: 'user.change_email', id, reason }));
});
check('plan change needs a plan slug', () => {
  assert.ok(ok({ action: 'user.set_plan', id, reason, plan: 'pro' }));
  assert.ok(!ok({ action: 'user.set_plan', id, reason, plan: 'Pro Plan!' }));
  assert.ok(!ok({ action: 'user.set_plan', id, reason }));
});
check('the grace period is 30 days', () => {
  assert.equal(DELETION_GRACE_DAYS, 30);
});
check('approval rules: four need a second person, purge and plan change do not', () => {
  const names = approvalRules.map((r) => r.action);
  for (const a of [
    'user.soft_delete',
    'user.force_password_reset',
    'user.reset_2fa',
    'user.change_email',
  ])
    assert.ok(names.includes(a), a);
  for (const a of ['user.purge', 'user.set_plan']) assert.ok(!names.includes(a), a);
});
check('the migration allows exactly the actions of the code', () => {
  const sql = readFileSync('migrations/S16_032_admin_user_actions.sql', 'utf8');
  const block = sql.slice(
    sql.indexOf('check (action in'),
    sql.indexOf('alter table public.admin_actions add column'),
  );
  const listed = [...block.matchAll(/'([a-z_.0-9]+)'/g)].map((m) => m[1]).sort();
  const fromCode = [
    'user.suspend',
    'user.reactivate',
    'tenant.suspend',
    'tenant.reactivate',
    'user.soft_delete',
    'user.purge',
    'user.force_password_reset',
    'user.reset_2fa',
    'user.change_email',
    'user.set_plan',
  ].sort();
  assert.deepEqual(listed, fromCode);
});

process.stdout.write(`step16-user-actions: ${checks} checks passed\n`);
