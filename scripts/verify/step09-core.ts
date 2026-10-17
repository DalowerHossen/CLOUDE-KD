// path: scripts/verify/step09-core.ts
// Logic checks of STEP 09 that need no database or network. Run: npx tsx scripts/verify/step09-core.ts
import assert from 'node:assert/strict';
import { convertUsd, fxConvertQuery, fxRateInput } from '@/lib/fx/rates';
import { exemptionInput, taxRateInput, taxSettingsInput, templateApply } from '@/lib/tax/input';
import { certificateExpired, reverseChargeApplies } from '@/lib/tax/rules';
import { TAX_TEMPLATES, US_STATES } from '@/lib/tax/templates';
import { permissions as registered } from '@/config/permissions';
import { Money } from '@/lib/utils/currency';
import { canTransition, isEditable, isSent, statusAfterPayment } from '@/lib/invoice/status';
import { FIXED_PREFIX, SERIES, formatNumber, manualNumberSchema } from '@/lib/invoice/numbering';
import { diffInputs } from '@/lib/invoice/diff';
import {
  blankLine,
  defaultInput,
  lineFromItem,
  previewTotals,
  termsFromDays,
} from '@/lib/invoice/form';
import { invoiceListQuery } from '@/lib/invoice/search';
import { addDays, daysBetween, dueDateFor, termsLabel } from '@/lib/invoice/terms';
import {
  invoiceInputSchema,
  invoiceLineSchema,
  invoiceUpdateSchema,
  statusOverrideSchema,
} from '@/lib/invoice/input';

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

  await check('invoice status machine', () => {
    assert.ok(canTransition('draft', 'sent') && canTransition('draft', 'pending_approval'));
    assert.ok(canTransition('pending_approval', 'draft'), 'a rejected invoice goes back to draft');
    assert.ok(!canTransition('sent', 'draft'), 'a sent invoice never becomes a draft again');
    assert.ok(!canTransition('void', 'sent') && !canTransition('paid', 'void'));
    assert.ok(canTransition('paid', 'disputed') && canTransition('partially_paid', 'paid'));
    assert.ok(isEditable('draft') && !isEditable('pending_approval') && !isEditable('sent'));
    assert.ok(isSent('viewed') && !isSent('pending_approval'));
    assert.equal(statusAfterPayment('sent', true, true), 'paid');
    assert.equal(statusAfterPayment('overdue', false, true), 'partially_paid');
    assert.equal(statusAfterPayment('disputed', false, true), 'disputed');
    assert.equal(statusAfterPayment('void', true, true), 'void');
  });

  await check('payment terms and due dates', () => {
    assert.equal(addDays('2026-01-31', 30), '2026-03-02');
    assert.equal(addDays('2024-02-28', 1), '2024-02-29', 'leap year');
    assert.equal(dueDateFor('2026-10-16', 'net_30', null), '2026-11-15');
    assert.equal(dueDateFor('2026-10-16', 'due_on_receipt', null), '2026-10-16');
    assert.equal(dueDateFor('2026-10-16', 'custom', '2026-12-01'), '2026-12-01');
    assert.equal(
      dueDateFor('2026-10-16', 'custom', '2026-01-01'),
      '2026-10-16',
      'never before the issue date',
    );
    assert.equal(daysBetween('2026-10-16', '2026-10-26'), 10);
    assert.equal(termsLabel('net_60', '2026-10-16', '2026-12-15'), 'Net 60');
  });

  await check('invoice input', () => {
    const id = '0190a0a0-0000-7000-8000-000000000001';
    const line = {
      productId: null,
      variantId: null,
      sku: '',
      description: 'Consulting',
      hsCode: '',
      quantity: '2.5',
      unit: 'hour',
      unitPrice: '100',
      discountKind: 'percent',
      discountValue: '10',
      taxExempt: false,
      taxCodes: ['VAT15'],
    };
    const block = {
      name: 'Buyer',
      contactName: '',
      email: '',
      phone: '',
      taxLabel: '',
      taxId: '',
      line1: '1 Main St',
      line2: '',
      city: 'NYC',
      region: 'NY',
      postalCode: '10001',
      country: 'US',
    };
    const options = {
      priceMode: 'exclusive',
      discountOrder: 'before_tax',
      roundingPolicy: 'per_line',
      roundingMode: 'half_up',
      precision: 2,
      cashRounding: '0',
      documentDiscountKind: 'none',
      documentDiscountValue: '0',
      shippingAmount: '0',
      shippingTaxable: false,
      shippingTaxCodes: [],
      withholdingRate: '0',
    };
    const invoice = {
      kind: 'invoice',
      clientId: id,
      walkInName: '',
      billTo: block,
      shipTo: null,
      issueDate: '2026-10-16',
      paymentTerms: 'net_30',
      dueDate: '2026-11-15',
      poNumber: 'PO-1',
      notes: 'Thank you',
      internalNotes: '',
      tags: ['vip', 'vip'],
      category: '',
      projectId: null,
      paperSize: 'letter',
      template: 'classic',
      displayCurrency: null,
      options,
      lines: [line],
    };
    const parsed = invoiceInputSchema.parse(invoice);
    assert.deepEqual(parsed.tags, ['vip'], 'duplicate tags removed');
    assert.ok(
      !invoiceInputSchema.safeParse({ ...invoice, total: '1' }).success,
      'totals cannot be sent',
    );
    assert.ok(!invoiceInputSchema.safeParse({ ...invoice, dueDate: '2026-10-01' }).success);
    assert.ok(!invoiceInputSchema.safeParse({ ...invoice, kind: 'receipt' }).success);
    assert.ok(!invoiceInputSchema.safeParse({ ...invoice, displayCurrency: 'USD' }).success);
    assert.ok(!invoiceInputSchema.safeParse({ ...invoice, notes: '<script>' }).success);
    assert.ok(
      invoiceInputSchema.safeParse({ ...invoice, lines: [] }).success,
      'a draft may have no lines',
    );
    assert.ok(invoiceLineSchema.safeParse({ ...line, discountValue: '100' }).success);
    assert.ok(
      !invoiceLineSchema.safeParse({ ...line, discountValue: '100.5' }).success,
      'percent at most 100',
    );
    assert.ok(
      invoiceLineSchema.safeParse({ ...line, quantity: '-1', unitPrice: '-5' }).success,
      'negative lines are allowed',
    );
    assert.ok(!invoiceLineSchema.safeParse({ ...line, unitPrice: '1.23456' }).success);
    assert.ok(
      !invoiceLineSchema.safeParse({ ...line, taxCodes: ['a', 'b', 'c', 'd', 'e', 'f'] }).success,
    );
    assert.ok(!invoiceLineSchema.safeParse({ ...line, taxCodes: ['vat 15'] }).success);
    assert.ok(
      invoiceUpdateSchema.safeParse({ expectedVersion: 1, autosave: true, invoice }).success,
    );
    assert.ok(
      !invoiceUpdateSchema.safeParse({ expectedVersion: 0, autosave: false, invoice }).success,
    );
    assert.ok(statusOverrideSchema.safeParse({ status: 'paid', reason: 'Paid by cheque' }).success);
    assert.ok(!statusOverrideSchema.safeParse({ status: 'paid', reason: 'x' }).success);
    const many = Array.from({ length: 2001 }, () => line);
    assert.ok(
      !invoiceInputSchema.safeParse({ ...invoice, lines: many }).success,
      'at most 2000 lines',
    );
    assert.ok(invoiceInputSchema.safeParse({ ...invoice, lines: many.slice(0, 2000) }).success);
  });

  await check('invoice permissions are registered', () => {
    const names = new Set(registered.map((p) => p.action));
    for (const a of [
      'invoice.read',
      'invoice.create',
      'invoice.update',
      'invoice.delete',
      'invoice.override_status',
    ])
      assert.ok(names.has(a), a);
    assert.deepEqual(registered.find((p) => p.action === 'invoice.override_status')?.defaultRoles, [
      'owner',
    ]);
  });

  await check('numbering rules', () => {
    assert.equal(formatNumber('INV-', false, 2026, 7, 4), 'INV-0007');
    assert.equal(formatNumber('INV-', true, 2026, 12345, 4), 'INV-2026-12345');
    assert.equal(SERIES.debit_note, 'DN');
    assert.equal(FIXED_PREFIX.proforma, 'PI-');
    assert.ok(manualNumberSchema.safeParse({ number: 'ACME/2026-17' }).success);
    assert.ok(!manualNumberSchema.safeParse({ number: 'bad number' }).success);
    assert.ok(!manualNumberSchema.safeParse({ number: '' }).success);
    assert.ok(!manualNumberSchema.safeParse({ number: 'A'.repeat(41) }).success);
  });

  await check('invoice form helpers, diff and list query', () => {
    const defaults = {
      options: {
        priceMode: 'exclusive',
        discountOrder: 'before_tax',
        roundingPolicy: 'per_line',
        roundingMode: 'half_up',
        precision: 2,
        cashRounding: '0',
        withholdingRate: '0',
      },
      defaultTaxCodes: ['VAT10'],
      paymentTerms: 'net_30',
      paperSize: 'letter',
    } as const;
    const blank = defaultInput(defaults, '2026-10-16');
    assert.equal(blank.dueDate, '2026-11-15');
    assert.deepEqual(blank.options.shippingTaxCodes, ['VAT10']);
    assert.equal(termsFromDays(15), 'net_15');
    assert.equal(termsFromDays(null), 'net_30');
    assert.equal(termsFromDays(45), 'custom');
    const line = lineFromItem(
      { id: 'p1', variantId: null, label: 'Widget', sku: 'W-1', unit: 'unit', unitPrice: '2.5000' },
      ['VAT10'],
    );
    assert.equal(line.unitPrice, '2.5');
    assert.deepEqual(line.taxCodes, ['VAT10']);
    const withLines = { ...blank, lines: [{ ...line, quantity: '4' }, blankLine([])] };
    const rates = [{ code: 'VAT10', name: 'VAT', rate: '10', compound: false }];
    const preview = previewTotals(withLines, rates);
    assert.equal(preview.result?.total, '11.0000', '4 x 2.5 + 10% tax');
    assert.equal(
      previewTotals({ ...withLines, lines: [{ ...line, quantity: 'abc' }] }, rates).result,
      null,
      'bad input gives no totals',
    );
    const edited = { ...withLines, poNumber: 'PO-9', lines: [{ ...line, quantity: '5' }] };
    const changes = diffInputs(withLines, edited);
    assert.ok(changes.some((c) => c.field === 'Purchase order' && c.to === 'PO-9'));
    assert.ok(changes.some((c) => c.field === 'Line 1'));
    assert.ok(changes.some((c) => c.field === 'Line 2' && c.to === '(removed)'));
    assert.deepEqual(diffInputs(withLines, withLines), []);
    assert.equal(invoiceListQuery.parse({}).size, '25');
    assert.ok(
      invoiceListQuery.safeParse({ status: 'sent,overdue', sort: 'amount', desc: '0', size: '100' })
        .success,
    );
    assert.ok(!invoiceListQuery.safeParse({ status: 'sent,bogus' }).success);
    assert.ok(!invoiceListQuery.safeParse({ size: '1000' }).success);
    assert.ok(!invoiceListQuery.safeParse({ sort: 'password' }).success);
    assert.ok(!invoiceListQuery.safeParse({ min: '1e9' }).success);
  });

  if (failures > 0) process.exit(1);
  process.stdout.write('step09-core: ok\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`step09-core crashed: ${String(error)}\n`);
  process.exit(1);
});
