// path: scripts/verify/step07-core.ts
// Logic checks of STEP 07 that need no database or network. Run: npx tsx scripts/verify/step07-core.ts
import assert from 'node:assert/strict';
import { INDUSTRY_LIST, PRESETS } from '@/lib/company/presets';
import {
  INDUSTRIES,
  SECTION_DEFAULTS,
  SECTION_KEYS,
  SECTION_SCHEMAS,
  previewNumber,
  profileSchema,
} from '@/lib/company/sections';
import { en } from '@/lib/i18n';
import { validateStaffGrants } from '@/lib/auth/permissions';
import { STAFF_PRESETS, expandPreset, matrix } from '@/lib/team/presets';
import { permissions as registered } from '@/config/permissions';
import type { PermissionDefinition } from '@/types/contracts';
import { FORMS, EDITABLE_SECTIONS } from '@/lib/company/forms';
import { stepSchema } from '@/lib/company/steps';

let failures = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    process.stdout.write(`ok    ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stderr.write(
      `FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

async function main(): Promise<void> {
  await check('every settings section has valid defaults and refuses unknown fields', () => {
    for (const key of SECTION_KEYS) {
      const schema = SECTION_SCHEMAS[key];
      assert.ok(schema.safeParse(SECTION_DEFAULTS[key]).success, `${key} defaults`);
      assert.ok(
        !schema.safeParse({ ...SECTION_DEFAULTS[key], extra: 1 }).success,
        `${key} unknown field`,
      );
    }
  });

  await check(
    'profile: markup, bad e-mail, bad phone, bad zone and bad country are refused',
    () => {
      const base = SECTION_DEFAULTS.profile;
      assert.ok(
        profileSchema.safeParse({
          ...base,
          legalName: 'Acme Ltd',
          country: 'US',
          timezone: 'Asia/Dhaka',
        }).success,
      );
      assert.ok(
        !profileSchema.safeParse({ ...base, legalName: '<script>alert(1)</script>' }).success,
        'markup',
      );
      assert.ok(!profileSchema.safeParse({ ...base, email: 'nope' }).success, 'e-mail');
      assert.ok(!profileSchema.safeParse({ ...base, phone: 'abc' }).success, 'phone');
      assert.ok(!profileSchema.safeParse({ ...base, timezone: 'Mars/Base' }).success, 'time zone');
      assert.ok(!profileSchema.safeParse({ ...base, country: 'usa' }).success, 'country');
      assert.ok(
        !profileSchema.safeParse({ ...base, website: 'http://example.com' }).success,
        'website needs https',
      );
      assert.ok(
        !profileSchema.safeParse({
          ...base,
          contacts: Array(6).fill({ name: 'A', role: '', email: '', phone: '' }),
        }).success,
        'contacts limit',
      );
    },
  );

  await check('branding, invoice and display values are range checked', () => {
    const b = SECTION_DEFAULTS.branding;
    assert.ok(!SECTION_SCHEMAS.branding.safeParse({ ...b, primaryColor: 'red' }).success);
    assert.ok(!SECTION_SCHEMAS.branding.safeParse({ ...b, logoFileId: 'x' }).success);
    const i = SECTION_DEFAULTS.invoice;
    assert.ok(
      !SECTION_SCHEMAS.invoice.safeParse({ ...i, invoicePrefix: 'inv-' }).success,
      'prefix upper case only',
    );
    assert.ok(
      !SECTION_SCHEMAS.invoice.safeParse({ ...i, dueDays: 33 }).success,
      'listed terms only',
    );
    assert.ok(!SECTION_SCHEMAS.invoice.safeParse({ ...i, padding: 2 }).success);
    assert.ok(
      !SECTION_SCHEMAS.display.safeParse({
        ...SECTION_DEFAULTS.display,
        displayCurrencies: ['USD', 'USD'],
      }).success,
      'currency twice',
    );
    assert.ok(
      !SECTION_SCHEMAS.display.safeParse({
        ...SECTION_DEFAULTS.display,
        displayCurrencies: ['XXX'],
      }).success,
    );
  });

  await check('invoice number preview', () => {
    const i = SECTION_DEFAULTS.invoice;
    assert.equal(previewNumber(i, 2026), 'INV-0001');
    assert.equal(
      previewNumber({ ...i, numbering: 'yearly', nextNumber: 42 }, 2026),
      'INV-2026-0042',
    );
    assert.equal(
      previewNumber({ ...i, invoicePrefix: '', padding: 6, nextNumber: 7 }, 2026),
      '000007',
    );
  });

  await check('industry presets: six, valid invoice wording, ASCII, no brand names', () => {
    assert.equal(INDUSTRY_LIST.length, 6);
    for (const key of INDUSTRIES) {
      const p = PRESETS[key];
      assert.equal(p.key, key);
      assert.ok(
        SECTION_SCHEMAS.invoice.safeParse({ ...SECTION_DEFAULTS.invoice, ...p.invoice }).success,
        key,
      );
      const text = JSON.stringify(p);
      assert.ok(!/[^\x00-\x7f]/.test(text), `${key} non-ASCII`);
      assert.ok(!/bkash|nagad|gcash|upi/i.test(text), `${key} brand`);
    }
  });

  await check('settings forms: every editable section has fields that exist in its schema', () => {
    for (const section of EDITABLE_SECTIONS) {
      const specs = FORMS[section];
      assert.ok(specs && specs.length > 0, section);
      const shape = (SECTION_SCHEMAS[section] as unknown as { shape: Record<string, unknown> })
        .shape;
      for (const spec of specs) {
        const root = spec.path?.[0] ?? spec.name;
        assert.ok(root in shape, `${section}.${spec.name} is not in the schema`);
        assert.ok(spec.label in en.s07Company.settings.fields, `label ${spec.label} has no text`);
      }
    }
    assert.ok(SECTION_SCHEMAS.notifications.safeParse(SECTION_DEFAULTS.notifications).success);
    assert.ok(
      !SECTION_SCHEMAS.notifications.safeParse({
        ...SECTION_DEFAULTS.notifications,
        summary: 'hourly',
      }).success,
    );
  });

  await check(
    'team presets expand only to actions staff may receive; staff never get team rights',
    () => {
      const defs: PermissionDefinition[] = [
        {
          action: 'invoice.read',
          description: 'x',
          defaultRoles: ['owner', 'staff'],
          approvalLevel: 'L0',
        },
        {
          action: 'invoice.create',
          description: 'x',
          defaultRoles: ['owner', 'staff'],
          approvalLevel: 'L0',
        },
        {
          action: 'invoice.delete',
          description: 'x',
          defaultRoles: ['owner'],
          approvalLevel: 'L1',
        },
        {
          action: 'client.read',
          description: 'x',
          defaultRoles: ['owner', 'staff'],
          approvalLevel: 'L0',
        },
        {
          action: 'client.update',
          description: 'x',
          defaultRoles: ['owner', 'staff'],
          approvalLevel: 'L0',
        },
        {
          action: 'payment.read',
          description: 'x',
          defaultRoles: ['owner', 'staff'],
          approvalLevel: 'L0',
        },
        {
          action: 'company.read',
          description: 'x',
          defaultRoles: ['owner', 'staff'],
          approvalLevel: 'L0',
        },
        { action: 'team.manage', description: 'x', defaultRoles: ['owner'], approvalLevel: 'L0' },
      ];
      assert.deepEqual(expandPreset('sales', defs), [
        'client.read',
        'client.update',
        'invoice.create',
        'invoice.read',
      ]);
      assert.deepEqual(expandPreset('support', defs), ['client.read']);
      assert.deepEqual(expandPreset('viewer', defs), [
        'client.read',
        'company.read',
        'invoice.read',
        'payment.read',
      ]);
      const manager = expandPreset('manager', defs);
      assert.ok(
        !manager.includes('company.read') &&
          !manager.includes('team.manage') &&
          !manager.includes('invoice.delete'),
      );
      assert.deepEqual(expandPreset('nope', defs), []);
      assert.deepEqual(
        matrix(defs).map((r) => r.domain),
        ['client', 'company', 'invoice', 'payment'],
      );
      for (const p of STAFF_PRESETS) {
        const v = validateStaffGrants(expandPreset(p.key, defs), defs);
        assert.ok(v.ok, `${p.key}: ${v.rejected.join(',')}`);
      }
      // The registered permissions: no team, KYC, billing or role right may ever be handed to staff.
      for (const d of registered.filter((x) =>
        /^(team|kyc|roles|flags|storage|email)\./.test(x.action),
      ))
        assert.ok(!d.defaultRoles.includes('staff'), `${d.action} must stay closed to staff`);
      assert.ok(
        !validateStaffGrants(['team.manage'], registered).ok,
        'a staff member cannot be given team.manage',
      );
      assert.ok(!validateStaffGrants(['team.*'], registered).ok, 'nor the whole team area');
    },
  );

  await check('security and approval sections', () => {
    const sec = SECTION_SCHEMAS.security;
    const d = SECTION_DEFAULTS.security;
    assert.ok(
      sec.safeParse({ ...d, ipAllowlist: ['203.0.113.7', '198.51.100.0/24', '2001:db8::1'] })
        .success,
    );
    assert.ok(!sec.safeParse({ ...d, ipAllowlist: ['999.1.1.1'] }).success, 'octet over 255');
    assert.ok(!sec.safeParse({ ...d, ipAllowlist: ['10.0.0.1/40'] }).success, 'mask over 32');
    assert.ok(
      !sec.safeParse({ ...d, ipAllowlist: ['evil.example.com'] }).success,
      'names are not addresses',
    );
    assert.ok(
      !sec.safeParse({ ...d, ipAllowlist: Array(21).fill('10.0.0.1') }).success,
      'twenty entries at most',
    );
    assert.ok(
      !sec.safeParse({ ...d, staffSessionTimeoutMinutes: 5 }).success &&
        sec.safeParse({ ...d, staffSessionTimeoutMinutes: 60 }).success,
    );
    const ap = SECTION_SCHEMAS.approval;
    assert.ok(
      ap.safeParse({ ownerApprovalActions: ['invoice.send'], staffAmountCap: '500.25' }).success,
    );
    assert.ok(!ap.safeParse({ ownerApprovalActions: ['Invoice'], staffAmountCap: null }).success);
    assert.ok(
      !ap.safeParse({ ownerApprovalActions: [], staffAmountCap: '12.34567' }).success,
      'five decimals',
    );
    assert.ok(!ap.safeParse({ ownerApprovalActions: [], staffAmountCap: '-5' }).success);
  });

  await check('wizard input: each step has its own strict shape', () => {
    const ok1 = { step: 1, legalName: 'Acme', industry: 'service', country: 'US', timezone: 'UTC' };
    assert.ok(stepSchema.safeParse(ok1).success);
    assert.ok(!stepSchema.safeParse({ ...ok1, legalName: '' }).success, 'name needed');
    assert.ok(!stepSchema.safeParse({ ...ok1, industry: 'mining' }).success);
    assert.ok(!stepSchema.safeParse({ ...ok1, extra: 1 }).success, 'unknown field');
    assert.ok(
      !stepSchema.safeParse({
        step: 3,
        primaryColor: '#12',
        accentColor: '#000000',
        fontKey: 'system',
      }).success,
    );
    assert.ok(
      stepSchema.safeParse({ step: 4, invoicePrefix: 'INV-', numbering: 'yearly', dueDays: 30 })
        .success,
    );
    assert.ok(
      !stepSchema.safeParse({ step: 4, invoicePrefix: 'inv', numbering: 'yearly', dueDays: 30 })
        .success,
    );
    assert.ok(stepSchema.safeParse({ step: 5, paymentsSkipped: true }).success);
    assert.ok(!stepSchema.safeParse({ step: 6 }).success, 'no sixth step');
    assert.ok(
      stepSchema.safeParse({ action: 'skip' }).success &&
        stepSchema.safeParse({ action: 'resume' }).success,
    );
    assert.ok(!stepSchema.safeParse({ action: 'delete' }).success);
  });
}

main()
  .then(() => {
    if (failures > 0) process.exit(1);
    process.stdout.write('step07-core: ok\n');
  })
  .catch((error: unknown) => {
    process.stderr.write(`step07-core crashed: ${String(error)}\n`);
    process.exit(1);
  });
