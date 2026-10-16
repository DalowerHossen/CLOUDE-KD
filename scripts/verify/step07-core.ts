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
import { registerTenantExport, tenantExports } from '@/lib/lifecycle/registry';
import { dnsRecords, evaluateDns, isPublicAddress, validateHostname } from '@/lib/domain/hostnames';
import { reviewActionSchema } from '@/lib/kyc/review-input';
import { registerScreeningProvider, runScreening } from '@/lib/kyc/screening';
import { contractStatus, isExpired, ownersSchema, uploadSchema, DOC_TYPES } from '@/lib/kyc/rules';
import { validateStaffGrants } from '@/lib/auth/permissions';
import { STAFF_PRESETS, expandPreset, matrix } from '@/lib/team/presets';
import { permissions as registered } from '@/config/permissions';
import type { PermissionDefinition } from '@/types/contracts';
import { FORMS, EDITABLE_SECTIONS } from '@/lib/company/forms';
import { stepSchema } from '@/lib/company/steps';
import { peopleActionSchema, tenantListQuery, userListQuery } from '@/lib/company/admin-input';

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

  await check('kyc rules: status mapping, owners, uploads and expiry', () => {
    assert.equal(contractStatus(null, false), 'not_submitted');
    assert.equal(contractStatus('draft', false), 'not_submitted');
    assert.equal(contractStatus('submitted', false), 'submitted');
    assert.equal(contractStatus('in_review', false), 'in_review');
    assert.equal(contractStatus('changes_requested', false), 'rejected');
    assert.equal(contractStatus('rejected', false), 'rejected');
    assert.equal(contractStatus('approved', false), 'approved');
    assert.equal(
      contractStatus('approved', true),
      'not_submitted',
      'an ended verification is not verified',
    );
    assert.equal(contractStatus('expired', false), 'not_submitted');
    assert.equal(isExpired(null), false);
    assert.equal(isExpired('2000-01-01T00:00:00Z'), true);
    assert.equal(isExpired(new Date(Date.now() + 86_400_000).toISOString()), false);
    const owner = {
      fullName: 'Jane Doe',
      dateOfBirth: '1985-04-12',
      nationality: 'US',
      ownershipPercent: '60',
      idNumber: 'X123',
    };
    assert.ok(
      ownersSchema.safeParse({
        owners: [owner, { ...owner, fullName: 'John Roe', ownershipPercent: '40' }],
      }).success,
    );
    assert.ok(
      !ownersSchema.safeParse({ owners: [owner, { ...owner, ownershipPercent: '50' }] }).success,
      'over 100 percent',
    );
    assert.ok(!ownersSchema.safeParse({ owners: [] }).success, 'at least one owner');
    assert.ok(
      !ownersSchema.safeParse({ owners: [{ ...owner, dateOfBirth: '2015-01-01' }] }).success,
      'under 18',
    );
    assert.ok(
      !ownersSchema.safeParse({ owners: [{ ...owner, fullName: '<b>x</b>' }] }).success,
      'markup',
    );
    assert.ok(!ownersSchema.safeParse({ owners: [{ ...owner, ownershipPercent: '101' }] }).success);
    assert.ok(
      !ownersSchema.safeParse({ owners: [{ ...owner, extra: 1 }] }).success,
      'unknown field',
    );
    assert.equal(DOC_TYPES.length, 4);
    const up = {
      docType: 'id_front',
      name: 'id.png',
      mimeType: 'image/png',
      dataBase64: 'AAAAAAAA',
    };
    assert.ok(uploadSchema.safeParse(up).success);
    assert.ok(
      !uploadSchema.safeParse({ ...up, mimeType: 'application/x-msdownload' }).success,
      'executable type',
    );
    assert.ok(!uploadSchema.safeParse({ ...up, docType: 'selfie' }).success);
    assert.ok(!uploadSchema.safeParse({ ...up, dataBase64: 'not base64!!' }).success);
  });

  await check('kyc review input and screening hook', async () => {
    const id = '018f0000-0000-7000-8000-000000000001';
    assert.ok(reviewActionSchema.safeParse({ action: 'start' }).success);
    assert.ok(
      reviewActionSchema.safeParse({
        action: 'documents',
        documents: [{ id, status: 'rejected', reason: 'Blurry' }],
      }).success,
    );
    assert.ok(
      !reviewActionSchema.safeParse({ action: 'documents', documents: [] }).success,
      'at least one document',
    );
    assert.ok(
      !reviewActionSchema.safeParse({ action: 'documents', documents: [{ id, status: 'pending' }] })
        .success,
    );
    assert.ok(
      !reviewActionSchema.safeParse({ action: 'reject', reason: 'no' }).success,
      'a reason is needed',
    );
    assert.ok(
      !reviewActionSchema.safeParse({
        action: 'request_changes',
        reason: '<script>alert(1)</script>',
      }).success,
      'markup',
    );
    assert.ok(
      reviewActionSchema.safeParse({ action: 'note', risk: 'high', note: 'Looks fine' }).success,
    );
    assert.ok(!reviewActionSchema.safeParse({ action: 'note', risk: 'extreme', note: '' }).success);
    assert.ok(
      !reviewActionSchema.safeParse({ action: 'approve' }).success,
      'a reviewer cannot approve, only recommend',
    );
    assert.equal(
      await runScreening([{ name: 'A', countryCode: null, kind: 'business' }]),
      null,
      'no provider, no result',
    );
    registerScreeningProvider({
      id: 'one',
      screen: async () => ({ status: 'clear', summary: 'one: clear.' }),
    });
    registerScreeningProvider({
      id: 'two',
      screen: async () => ({ status: 'hits', summary: 'two: 1 match.' }),
    });
    registerScreeningProvider({
      id: 'bad',
      screen: async () => {
        throw new Error('down');
      },
    });
    const result = await runScreening([{ name: 'A', countryCode: 'US', kind: 'person' }]);
    assert.equal(result?.status, 'hits', 'a match beats a clear result and an error');
    assert.ok(
      result?.summary.includes('two: 1 match.') &&
        result.summary.includes('could not be completed'),
    );
  });

  await check('domains: hostname rules, DNS records and answers, public addresses only', () => {
    const platform = 'app.kdsolution.test';
    assert.equal(validateHostname('billing.example.com', platform), null);
    assert.equal(
      validateHostname('Billing.Example.COM.', platform),
      null,
      'case and trailing dot are ignored',
    );
    for (const bad of [
      'localhost',
      'example',
      '10.0.0.1',
      'a b.example.com',
      'bad_name.example.com',
      '-x.example.com',
      'host.local',
      'x.internal',
      'app.kdsolution.test',
      'evil.app.kdsolution.test',
      '',
      'a.b',
    ])
      assert.ok(validateHostname(bad, platform) !== null, bad);
    assert.ok(
      validateHostname(`${'a'.repeat(64)}.example.com`, platform) !== null,
      'label over 63 characters',
    );
    const token = 'a'.repeat(32);
    const records = dnsRecords('billing.example.com', token, platform);
    assert.deepEqual(
      records.map((r) => [r.type, r.name, r.value, r.required]),
      [
        ['TXT', '_kd-verify.billing.example.com', `kd-verify=${token}`, true],
        ['CNAME', 'billing.example.com', platform, false],
      ],
    );
    assert.deepEqual(
      evaluateDns(
        { txt: [['kd-verify=', token]], cname: ['APP.kdsolution.test.'] },
        token,
        platform,
      ),
      { ownership: true, routing: true },
    );
    assert.deepEqual(evaluateDns({ txt: [['kd-verify=other']], cname: [] }, token, platform), {
      ownership: false,
      routing: false,
    });
    assert.deepEqual(evaluateDns({ txt: [], cname: ['elsewhere.example.net'] }, token, platform), {
      ownership: false,
      routing: false,
    });
    for (const ip of [
      '10.1.2.3',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      'fe80::1',
      'fd00::1',
      '::ffff:10.0.0.1',
      '999.1.1.1',
      'abc',
    ])
      assert.equal(isPublicAddress(ip), false, ip);
    for (const ip of ['8.8.8.8', '203.0.113.10', '172.32.0.1', '2606:4700::1111'])
      assert.equal(isPublicAddress(ip), true, ip);
  });

  await check('policy and backup sections; export registry refuses secret columns', () => {
    const p = SECTION_DEFAULTS.policy;
    assert.ok(SECTION_SCHEMAS.policy.safeParse(p).success);
    assert.ok(
      !SECTION_SCHEMAS.policy.safeParse({ ...p, minPasswordLength: 6 }).success,
      'at least 10',
    );
    assert.ok(!SECTION_SCHEMAS.policy.safeParse({ ...p, minPasswordLength: 100 }).success);
    assert.ok(
      !SECTION_SCHEMAS.backup.safeParse({ schedule: 'hourly', lastScheduledAt: null }).success,
    );
    assert.ok(
      SECTION_SCHEMAS.backup.safeParse({
        schedule: 'weekly',
        lastScheduledAt: '2026-10-01T00:00:00.000Z',
      }).success,
    );
    registerTenantExport({
      table: 'sample_table',
      label: 'sample',
      columns: ['id', 'name', 'created_at'],
    });
    assert.ok(tenantExports().some((t) => t.table === 'sample_table'));
    for (const col of [
      'password_hash',
      'token_hash',
      'api_key',
      'secret_value',
      'owners_encrypted',
      'otp_code',
      'ciphertext',
    ])
      assert.throws(
        () => registerTenantExport({ table: 'bad_table', label: 'bad', columns: ['id', col] }),
        col,
      );
    assert.throws(() =>
      registerTenantExport({ table: 'Bad-Table', label: 'bad', columns: ['id'] }),
    );
    assert.throws(() =>
      registerTenantExport({ table: 'ok_table', label: 'bad', columns: ['id; drop table x'] }),
    );
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

  await check('admin people input', () => {
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    assert.ok(
      peopleActionSchema.safeParse({ action: 'user.suspend', id, reason: 'Repeated chargebacks' })
        .success,
    );
    assert.ok(
      !peopleActionSchema.safeParse({ action: 'user.suspend', id, reason: 'short' }).success,
    );
    assert.ok(
      !peopleActionSchema.safeParse({ action: 'tenant.suspend', id, reason: '<b>bad reason</b>' })
        .success,
    );
    assert.ok(!peopleActionSchema.safeParse({ action: 'user.delete', id }).success);
    assert.ok(
      !peopleActionSchema.safeParse({ action: 'user.verify_email', id, extra: 1 }).success,
      'strict',
    );
    assert.ok(
      peopleActionSchema.safeParse({ action: 'note', subject: 'tenant', id, body: 'Called' })
        .success,
    );
    assert.ok(
      !peopleActionSchema.safeParse({ action: 'note', subject: 'tenant', id, body: '' }).success,
    );
    assert.equal(userListQuery.parse({}).page, 1);
    assert.ok(!userListQuery.safeParse({ role: 'ceo' }).success);
    assert.ok(!tenantListQuery.safeParse({ page: '0' }).success);
    assert.ok(!tenantListQuery.safeParse({ unknown: 'x' }).success);
    const ids = new Set(registered.map((d: PermissionDefinition) => d.action));
    for (const a of ['admin.home', 'people.read', 'people.note', 'people.manage'])
      assert.ok(ids.has(a), a);
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
