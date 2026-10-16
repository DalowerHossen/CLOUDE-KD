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
