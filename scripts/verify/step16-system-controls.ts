// path: scripts/verify/step16-system-controls.ts
// Operations controls: the maintenance switch and its window, kill switch and company cap input rules, the cap in force, and
// the configuration screen showing names and state but never a value.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-system-controls.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OFF,
  activeCap,
  isMaintenanceActive,
  killSwitchSchema,
  maintenanceSchema,
  tenantLimitSchema,
} from '@/lib/platform/controls';
import { configStatus } from '@/services/platform/config-status';

const company = '0192f0a0-0000-7000-8000-000000000001';
const at = (iso: string): Date => new Date(iso);
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

check('maintenance: off by default, on with the switch, window respected', () => {
  assert.equal(isMaintenanceActive(OFF), false);
  const on = { enabled: true, message: '', startsAt: null, endsAt: null };
  assert.equal(isMaintenanceActive(on), true);
  const windowed = { ...on, startsAt: '2026-10-27T01:00:00Z', endsAt: '2026-10-27T03:00:00Z' };
  assert.equal(isMaintenanceActive(windowed, at('2026-10-27T00:59:59Z')), false);
  assert.equal(isMaintenanceActive(windowed, at('2026-10-27T01:00:00Z')), true);
  assert.equal(isMaintenanceActive(windowed, at('2026-10-27T02:59:59Z')), true);
  assert.equal(isMaintenanceActive(windowed, at('2026-10-27T03:00:00Z')), false);
  assert.equal(
    isMaintenanceActive({ ...windowed, enabled: false }, at('2026-10-27T02:00:00Z')),
    false,
  );
});
check('maintenance input: end after start, no angle brackets, no extra fields', () => {
  const base = { enabled: true, message: 'Back soon', startsAt: null, endsAt: null };
  assert.ok(maintenanceSchema.safeParse(base).success);
  assert.ok(
    !maintenanceSchema.safeParse({
      ...base,
      startsAt: '2026-10-27T03:00:00Z',
      endsAt: '2026-10-27T01:00:00Z',
    }).success,
  );
  assert.ok(!maintenanceSchema.safeParse({ ...base, message: '<b>x</b>' }).success);
  assert.ok(!maintenanceSchema.safeParse({ ...base, extra: 1 }).success);
  assert.ok(!maintenanceSchema.safeParse({ ...base, startsAt: 'tomorrow' }).success);
});
check('kill switch input', () => {
  assert.ok(
    killSwitchSchema.safeParse({
      action: 'engage',
      flagKey: 'module.whatsapp',
      reason: 'Provider outage now',
    }).success,
  );
  assert.ok(
    !killSwitchSchema.safeParse({
      action: 'engage',
      flagKey: 'Module WhatsApp',
      reason: 'Provider outage now',
    }).success,
  );
  assert.ok(
    !killSwitchSchema.safeParse({ action: 'engage', flagKey: 'module.whatsapp', reason: 'short' })
      .success,
  );
  assert.ok(killSwitchSchema.safeParse({ action: 'release', id: company }).success);
  assert.ok(!killSwitchSchema.safeParse({ action: 'release', id: 'x' }).success);
});
check('company cap input and the cap in force', () => {
  const set = {
    action: 'set',
    companyId: company,
    limitPerMinute: 600,
    reason: 'Heavy import this week',
    expiresAt: null,
  };
  assert.ok(tenantLimitSchema.safeParse(set).success);
  assert.ok(!tenantLimitSchema.safeParse({ ...set, limitPerMinute: 0 }).success);
  assert.ok(!tenantLimitSchema.safeParse({ ...set, limitPerMinute: 100_001 }).success);
  assert.ok(!tenantLimitSchema.safeParse({ ...set, limitPerMinute: 1.5 }).success);
  assert.ok(tenantLimitSchema.safeParse({ action: 'clear', companyId: company }).success);
  assert.equal(activeCap(null), null);
  assert.equal(activeCap({ limitPerMinute: 600, expiresAt: null }), 600);
  assert.equal(
    activeCap(
      { limitPerMinute: 600, expiresAt: '2026-10-27T00:00:00Z' },
      at('2026-10-26T00:00:00Z'),
    ),
    600,
  );
  assert.equal(
    activeCap(
      { limitPerMinute: 600, expiresAt: '2026-10-27T00:00:00Z' },
      at('2026-10-27T00:00:00Z'),
    ),
    null,
  );
});
check('configuration screen shows names and state, never values', () => {
  const secret = 'super-secret-value-123456789';
  const groups = configStatus({
    SUPABASE_SERVICE_ROLE_KEY: secret,
    SMTP_PASSWORD: secret,
  });
  const text = JSON.stringify(groups);
  assert.ok(!text.includes(secret));
  const all = groups.flatMap((g) => g.items);
  assert.ok(all.length > 5);
  assert.equal(all.find((i) => i.name === 'SMTP_PASSWORD')?.set, true);
  assert.equal(
    all.every((i) => typeof i.set === 'boolean' && typeof i.required === 'boolean'),
    true,
  );
});
check('the migration allows the maintenance key only', () => {
  const sql = readFileSync('migrations/S16_033_platform_controls.sql', 'utf8');
  assert.ok(sql.includes("check (key in ('maintenance'))"));
});

process.stdout.write(`step16-system-controls: ${checks} checks passed\n`);
