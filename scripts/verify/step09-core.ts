// path: scripts/verify/step09-core.ts
// Logic checks of STEP 09 that need no database or network. Run: npx tsx scripts/verify/step09-core.ts
import assert from 'node:assert/strict';
import { convertUsd, fxConvertQuery, fxRateInput } from '@/lib/fx/rates';
import { exemptionInput, taxRateInput, taxSettingsInput, templateApply } from '@/lib/tax/input';
import { certificateExpired, reverseChargeApplies } from '@/lib/tax/rules';
import { TAX_TEMPLATES, US_STATES } from '@/lib/tax/templates';
import { permissions as registered } from '@/config/permissions';
import { Money } from '@/lib/utils/currency';

let failures = 0;
function check(name: string, fn: () => unknown): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      process.stdout.write(`ok    ${name}\n`);
    })
    .catch((error: unknown) => {
      failures += 1;
      process.stderr.write(
        `FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    });
}

const rate = {
  code: 'vat15',
  name: 'VAT 15%',
  rate: '15',
  kind: 'vat',
  country: 'BD',
  region: '',
  compound: false,
  isActive: true,
  sortOrder: 0,
};
const settings = {
  priceMode: 'exclusive',
  discountOrder: 'before_tax',
  roundingPolicy: 'per_line',
  roundingMode: 'half_up',
  precision: 2,
  cashRounding: '0',
  fiscalYearStartMonth: 4,
  sellerTaxLabel: 'EIN',
  sellerTaxId: '12-3456789',
  sellerCountry: 'US',
  reverseCharge: false,
  marketplaceFacilitator: false,
  nexusRegions: ['CA', 'NY', 'CA'],
  defaultTaxCodes: ['VAT15'],
  defaultWithholding: '0',
};

async function main(): Promise<void> {
  await check('tax rate input', () => {
    const parsed = taxRateInput.parse(rate);
    assert.equal(parsed.code, 'VAT15', 'codes are upper-cased');
    assert.ok(!taxRateInput.safeParse({ ...rate, rate: '100.5' }).success);
    assert.ok(!taxRateInput.safeParse({ ...rate, rate: '-1' }).success);
    assert.ok(!taxRateInput.safeParse({ ...rate, code: 'bad code' }).success);
    assert.ok(!taxRateInput.safeParse({ ...rate, name: '<b>' }).success);
    assert.ok(!taxRateInput.safeParse({ ...rate, extra: 1 }).success);
    assert.ok(!taxRateInput.safeParse({ ...rate, country: 'BGD' }).success);
  });

  await check('tax settings input', () => {
    const parsed = taxSettingsInput.parse(settings);
    assert.deepEqual(parsed.nexusRegions, ['CA', 'NY'], 'duplicates removed');
    assert.ok(
      !taxSettingsInput.safeParse({ ...settings, precision: 6 }).success,
      'six places cannot be stored',
    );
    assert.ok(!taxSettingsInput.safeParse({ ...settings, cashRounding: '0.07' }).success);
    assert.ok(!taxSettingsInput.safeParse({ ...settings, nexusRegions: ['ZZ'] }).success);
    assert.ok(!taxSettingsInput.safeParse({ ...settings, fiscalYearStartMonth: 13 }).success);
    assert.ok(
      !taxSettingsInput.safeParse({ ...settings, defaultTaxCodes: ['A', 'B', 'C', 'D', 'E', 'F'] })
        .success,
    );
    assert.equal(US_STATES.length, 51);
  });

  await check('country templates', () => {
    assert.ok(TAX_TEMPLATES.length >= 13);
    for (const t of TAX_TEMPLATES) {
      assert.ok(templateApply.safeParse({ templateId: t.id }).success, `template id ${t.id}`);
      assert.equal(
        new Set(t.rates.map((r) => r.code)).size,
        t.rates.length,
        `unique codes in ${t.id}`,
      );
      for (const r of t.rates)
        assert.ok(
          taxRateInput.safeParse({
            ...r,
            country: t.country,
            region: '',
            isActive: true,
            sortOrder: 0,
          }).success,
          `${t.id} ${r.code}`,
        );
    }
    const pairs = Object.fromEntries(TAX_TEMPLATES.map((t) => [t.country, t.rates[0]?.rate]));
    assert.equal(pairs.SG, '9');
    assert.equal(pairs.BD, '15');
    assert.equal(pairs.PK, '17');
    assert.equal(pairs.TH, '7');
  });

  await check('exemption input and certificate expiry', () => {
    const ok = {
      taxExempt: true,
      reason: 'Resale',
      certificateExpiresOn: '2027-01-31',
      clientTaxId: 'DE123',
      clientTaxLabel: 'VAT',
    };
    assert.ok(exemptionInput.safeParse(ok).success);
    assert.ok(!exemptionInput.safeParse({ ...ok, certificateExpiresOn: '31/01/2027' }).success);
    assert.ok(certificateExpired('2026-01-01', '2026-10-16'));
    assert.ok(!certificateExpired('2026-10-16', '2026-10-16'));
    assert.ok(!certificateExpired(null, '2026-10-16'));
  });

  await check('EU reverse charge', () => {
    const base = { enabled: true, sellerCountry: 'DE', clientCountry: 'FR', clientTaxId: 'FR123' };
    assert.ok(reverseChargeApplies(base));
    assert.ok(!reverseChargeApplies({ ...base, enabled: false }));
    assert.ok(!reverseChargeApplies({ ...base, clientCountry: 'DE' }), 'same country');
    assert.ok(!reverseChargeApplies({ ...base, clientCountry: 'US' }), 'outside the EU');
    assert.ok(!reverseChargeApplies({ ...base, clientTaxId: '' }), 'no tax number');
    assert.ok(!reverseChargeApplies({ ...base, sellerCountry: null }));
  });

  await check('exchange rates and conversion for display', () => {
    assert.ok(fxRateInput.safeParse({ currency: 'EUR', rate: '0.92', asOf: '2026-10-16' }).success);
    assert.ok(!fxRateInput.safeParse({ currency: 'USD', rate: '1', asOf: '2026-10-16' }).success);
    assert.ok(!fxRateInput.safeParse({ currency: 'EUR', rate: '0', asOf: '2026-10-16' }).success);
    assert.ok(
      !fxRateInput.safeParse({ currency: 'EUR', rate: '0.123456789', asOf: '2026-10-16' }).success,
    );
    assert.ok(!fxRateInput.safeParse({ currency: 'XYZ', rate: '1', asOf: '2026-10-16' }).success);
    assert.ok(fxConvertQuery.safeParse({ amount: '12.5', currency: 'JPY' }).success);
    assert.equal(convertUsd(Money.parse('100'), '0.92', 'EUR'), '92.00');
    assert.equal(convertUsd(Money.parse('100'), '150.5', 'JPY'), '15050');
    assert.equal(convertUsd(Money.parse('1.005'), '1', 'EUR'), '1.01');
    assert.equal(convertUsd(Money.parse('-10'), '0.333', 'GBP'), '-3.33');
    assert.equal(convertUsd(Money.parse('0'), '0.5', 'EUR'), '0.00');
    assert.equal(convertUsd(Money.parse('1'), '25000', 'VND'), '25000');
  });

  await check('tax permissions are registered', () => {
    const names = new Set(registered.map((p) => p.action));
    assert.ok(names.has('tax.read') && names.has('tax.manage'));
    assert.deepEqual(registered.find((p) => p.action === 'tax.manage')?.defaultRoles, ['owner']);
  });

  if (failures > 0) process.exit(1);
  process.stdout.write('step09-core: ok\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`step09-core crashed: ${String(error)}\n`);
  process.exit(1);
});
