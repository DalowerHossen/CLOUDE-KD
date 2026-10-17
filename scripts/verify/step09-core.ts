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
import { installmentStatuses, planProblems, splitInstallments } from '@/lib/schedule/installments';
import { installmentPlanSchema, recurringPreviewSchema } from '@/lib/schedule/input';
import {
  fillPlaceholders,
  localDay,
  occurrenceDate,
  previewDates,
  withinEnd,
} from '@/lib/schedule/recurrence';
import { lateFeeAmount, periodsDue, type LateRule } from '@/lib/schedule/late-fees';
import {
  dueSteps,
  isBusinessDay,
  isQuietHour,
  normalizeSteps,
  stageOf,
} from '@/lib/schedule/reminders';
import {
  feeDecisionSchema,
  holdSchema,
  lateFeeSettingsSchema,
  reminderSettingsSchema,
  writeOffSchema,
} from '@/lib/schedule/input';
import {
  BILLING_TYPES,
  hoursText,
  memberInputSchema,
  projectInputSchema,
  timeDecisionSchema,
  timeEntryInputSchema,
  timeSettingsSchema,
} from '@/lib/project/input';
import {
  budgetUse,
  entryAmount,
  entryRate,
  timerHours,
  weekDays,
  weekStart,
} from '@/lib/project/time';
import { hourLines, retainerSplit, type Claimed } from '@/lib/project/bill-lines';
import { billInputSchema } from '@/lib/project/input';
import { RANGE_KEYS, changePercent, previousRange, rangeFor } from '@/lib/reports/ranges';
import {
  WIDGET_IDS,
  defaultLayout,
  layoutSchema,
  moveWidget,
  normalizeLayout,
  type WidgetId,
} from '@/lib/reports/widgets';
import {
  agingBucket,
  creditsReport,
  estimatesFunnel,
  paymentsReceived,
  receivablesAging,
  revenueByClient,
  revenueByItem,
  salesSummary,
  statusSummary,
  taxSummary,
  timeSummary,
  type CreditFact,
  type InvoiceFact,
} from '@/lib/reports/aggregate';
import { compareTotals } from '@/lib/reports/compare';
import { reportParamsSchema, resolveParams, scheduleInputSchema } from '@/lib/reports/params';
import { nextRun } from '@/lib/schedule/report-schedule';
import { buildXlsx, zipStore } from '@/lib/export/xlsx';
import { csvOf } from '@/lib/reports/csv';
import {
  ConflictError,
  DuplicateError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { batchCreateSchema, batchPercent, outcomeOfError } from '@/lib/invoice/batch';
import { buildCredit } from '@/lib/credit/build';
import type { InvoiceView } from '@/services/invoice/invoices';
import {
  creditApplySchema,
  creditCreateSchema,
  debitNoteSchema,
  depositCreateSchema,
} from '@/lib/credit/input';
import { estimateDecisionSchema } from '@/lib/estimate/input';
import { canConvert, canRevise, canVoid, isDecidable } from '@/lib/estimate/status';
import { EMPTY_REMIT_TO, hasRemitTo, remitToSchema } from '@/lib/invoice/remit';
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

  await check('remit-to details, send permissions and approval rule', () => {
    const ok = {
      bankName: 'First Bank',
      accountName: 'Acme LLC',
      accountNumber: '1234 5678-90',
      routingNumber: '021000021',
      swift: 'chasus33',
      iban: 'gb29nwbk60161331926819',
      instructions: 'Quote the invoice number',
    };
    const parsed = remitToSchema.parse(ok);
    assert.equal(parsed.swift, 'CHASUS33', 'upper-cased');
    assert.equal(parsed.iban, 'GB29NWBK60161331926819');
    assert.ok(!remitToSchema.safeParse({ ...ok, swift: 'ABC' }).success);
    assert.ok(!remitToSchema.safeParse({ ...ok, accountNumber: '12<34>' }).success);
    assert.ok(!remitToSchema.safeParse({ ...ok, iban: 'not an iban' }).success);
    assert.ok(remitToSchema.safeParse(EMPTY_REMIT_TO).success);
    assert.ok(!hasRemitTo(EMPTY_REMIT_TO) && hasRemitTo(parsed) && !hasRemitTo(null));
    const names = new Map(registered.map((p) => [p.action, p]));
    assert.equal(names.get('invoice.send')?.approvalLevel, 'L1');
    assert.deepEqual(names.get('invoice.void')?.defaultRoles, ['owner']);
  });

  await check('estimate decision, statuses and permissions', () => {
    assert.ok(
      estimateDecisionSchema.safeParse({
        decision: 'accepted',
        signerName: 'Wendy W',
        note: '',
        agree: true,
      }).success,
    );
    assert.ok(
      !estimateDecisionSchema.safeParse({
        decision: 'accepted',
        signerName: 'Wendy W',
        note: '',
        agree: false,
      }).success,
      'accepting needs the agree box',
    );
    assert.ok(
      estimateDecisionSchema.safeParse({
        decision: 'declined',
        signerName: 'Wendy W',
        note: 'Too high',
        agree: false,
      }).success,
    );
    assert.ok(
      !estimateDecisionSchema.safeParse({
        decision: 'accepted',
        signerName: 'W',
        note: '',
        agree: true,
      }).success,
      'a real name is needed',
    );
    assert.ok(isDecidable('sent') && isDecidable('viewed') && !isDecidable('accepted'));
    assert.ok(canConvert('accepted') && !canConvert('sent') && !canConvert('converted'));
    assert.ok(canRevise('sent') && canRevise('expired') && !canRevise('accepted'));
    assert.ok(canVoid('accepted') && !canVoid('converted') && !canVoid('void'));
    const names = new Map(registered.map((p) => [p.action, p]));
    assert.deepEqual(names.get('estimate.void')?.defaultRoles, ['owner']);
    assert.ok(names.has('estimate.convert') && names.has('estimate.send'));
  });

  await check('credit note, deposit and debit note input', () => {
    const ok = { reason: 'return', reasonNote: '', returnToStock: true, mode: 'full', lines: [] };
    assert.ok(creditCreateSchema.safeParse(ok).success);
    assert.ok(!creditCreateSchema.safeParse({ ...ok, mode: 'lines', lines: [] }).success);
    assert.ok(
      !creditCreateSchema.safeParse({
        ...ok,
        mode: 'lines',
        lines: [{ position: 1, quantity: '0' }],
      }).success,
      'a credit of nothing is refused',
    );
    assert.ok(
      creditCreateSchema.safeParse({
        ...ok,
        mode: 'lines',
        lines: [{ position: 2, quantity: '1.5' }],
      }).success,
    );
    assert.ok(!creditCreateSchema.safeParse({ ...ok, reason: 'because' }).success);
    assert.ok(!creditCreateSchema.safeParse({ ...ok, extra: 1 }).success, 'strict');
    const id = '0190c1a0-0000-7000-8000-000000000001';
    assert.ok(
      creditApplySchema.safeParse({
        sourceType: 'deposit',
        sourceId: id,
        invoiceId: id,
        amount: '10.5',
      }).success,
    );
    assert.ok(
      !creditApplySchema.safeParse({
        sourceType: 'deposit',
        sourceId: id,
        invoiceId: id,
        amount: '0',
      }).success,
    );
    assert.ok(
      !creditApplySchema.safeParse({
        sourceType: 'wallet',
        sourceId: id,
        invoiceId: id,
        amount: '1',
      }).success,
    );
    assert.ok(
      depositCreateSchema.safeParse({ mode: 'percent', value: '30', description: '' }).success,
    );
    assert.ok(
      !depositCreateSchema.safeParse({ mode: 'percent', value: '120', description: '' }).success,
    );
    assert.ok(
      depositCreateSchema.safeParse({ mode: 'amount', value: '500.25', description: '' }).success,
    );
    assert.ok(!debitNoteSchema.safeParse({ reason: 'Extra work', lines: [] }).success);
    const names = new Map(registered.map((p) => [p.action, p]));
    assert.deepEqual(names.get('credit.issue')?.defaultRoles, ['owner']);
    assert.ok(names.has('credit.apply') && names.has('credit.void') && names.has('credit.create'));
  });

  await check('credit note amounts from an invoice', () => {
    const vat = { code: 'VAT10', name: 'VAT 10%', rate: '10', compound: false };
    const line = (
      position: number,
      qty: string,
      price: string,
      taxes: (typeof vat)[],
    ): Record<string, unknown> => {
      const net = Money.parse(qty).mul(price);
      const tax = taxes.length > 0 ? net.percent('10') : Money.zero();
      return {
        position,
        productId: null,
        variantId: null,
        sku: '',
        description: `Line ${position}`,
        hsCode: '',
        quantity: qty,
        unit: 'each',
        unitPrice: price,
        discountKind: 'none',
        discountValue: '0',
        taxExempt: false,
        taxes,
        gross: net.toDbString(),
        lineDiscount: '0.0000',
        documentDiscountShare: '0.0000',
        net: net.toDbString(),
        tax: tax.toDbString(),
        lineTotal: net.add(tax).toDbString(),
      };
    };
    const invoice = {
      options: {
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
      },
      lines: [line(1, '4', '10.00', [vat]), line(2, '1', '100.00', [])],
      taxBreakdown: [],
      totals: { subtotal: '140.0000', taxTotal: '4.0000', amountDue: '144.0000' },
    } as unknown as InvoiceView;
    const full = buildCredit(
      invoice,
      { reason: 'cancellation', reasonNote: '', returnToStock: false, mode: 'full', lines: [] },
      new Map(),
    );
    assert.equal(full.total, '144.0000', 'a full credit equals the invoice');
    const part = buildCredit(
      invoice,
      {
        reason: 'return',
        reasonNote: '',
        returnToStock: true,
        mode: 'lines',
        lines: [{ position: 1, quantity: '1' }],
      },
      new Map(),
    );
    assert.equal(part.subtotal, '10.0000');
    assert.equal(part.taxTotal, '1.0000');
    assert.equal(part.total, '11.0000', 'one unit with its tax');
    assert.throws(() =>
      buildCredit(
        invoice,
        {
          reason: 'return',
          reasonNote: '',
          returnToStock: false,
          mode: 'lines',
          lines: [{ position: 1, quantity: '4' }],
        },
        new Map([[1, Money.parse('1')]]),
      ),
    );
    assert.throws(() =>
      buildCredit(
        invoice,
        { reason: 'other', reasonNote: '', returnToStock: false, mode: 'full', lines: [] },
        new Map([[1, Money.parse('1')]]),
      ),
    );
    const rest = buildCredit(
      invoice,
      {
        reason: 'return',
        reasonNote: '',
        returnToStock: false,
        mode: 'lines',
        lines: [
          { position: 1, quantity: '3' },
          { position: 2, quantity: '1' },
        ],
      },
      new Map([[1, Money.parse('1')]]),
    );
    assert.equal(rest.total, '133.0000', '30 + 3 tax + 100');
  });

  await check('recurring dates never drift and respect month ends', () => {
    const monthly = { unit: 'month', every: 1, monthEnd: false, startDate: '2026-01-31' } as const;
    assert.deepEqual(previewDates(monthly, 0, 5), [
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
    assert.equal(
      occurrenceDate({ ...monthly, startDate: '2028-01-31' }, 1),
      '2028-02-29',
      'leap year',
    );
    assert.equal(
      occurrenceDate({ unit: 'month', every: 1, monthEnd: true, startDate: '2026-02-10' }, 1),
      '2026-03-31',
      'month end rule',
    );
    assert.equal(
      occurrenceDate({ unit: 'month', every: 3, monthEnd: false, startDate: '2026-11-15' }, 2),
      '2027-05-15',
      'quarterly across a year',
    );
    assert.equal(
      occurrenceDate({ unit: 'year', every: 1, monthEnd: false, startDate: '2024-02-29' }, 1),
      '2025-02-28',
      'a leap day moves to the 28th in a normal year',
    );
    assert.equal(
      occurrenceDate({ unit: 'week', every: 2, monthEnd: false, startDate: '2026-12-25' }, 2),
      '2027-01-22',
      'two-week steps cross the year',
    );
    assert.equal(
      occurrenceDate({ unit: 'day', every: 10, monthEnd: false, startDate: '2026-03-01' }, 3),
      '2026-03-31',
    );
    const end = { endDate: '2026-04-30', maxOccurrences: null };
    assert.ok(withinEnd(monthly, end, 3) && !withinEnd(monthly, end, 4), 'end date');
    assert.ok(!withinEnd(monthly, { endDate: null, maxOccurrences: 2 }, 2), 'maximum count');
    assert.equal(
      fillPlaceholders('Retainer {month} {year} ({number})', '2026-03-31', 3),
      'Retainer March 2026 (3)',
    );
    assert.equal(
      localDay(new Date('2026-06-30T20:00:00Z'), 'Asia/Dhaka'),
      '2026-07-01',
      'company time zone',
    );
    assert.equal(localDay(new Date('2026-06-30T20:00:00Z'), 'UTC'), '2026-06-30');
    assert.ok(
      !recurringPreviewSchema.safeParse({
        unit: 'year',
        every: 6,
        monthEnd: false,
        startDate: '2026-01-01',
        from: 0,
      }).success,
      'a year interval above five is refused',
    );
  });

  await check('installments add up exactly and follow payments', () => {
    const rows = splitInstallments({
      total: '100.0000',
      count: 3,
      firstDue: '2026-01-31',
      unit: 'month',
      every: 1,
      downPaymentPercent: '0',
    });
    assert.deepEqual(
      rows.map((r) => r.amount),
      ['33.3333', '33.3333', '33.3334'],
      'the last part takes the rest',
    );
    assert.deepEqual(
      rows.map((r) => r.dueDate),
      ['2026-01-31', '2026-02-28', '2026-03-31'],
    );
    const down = splitInstallments({
      total: '1000.0000',
      count: 4,
      firstDue: '2026-05-01',
      unit: 'month',
      every: 1,
      downPaymentPercent: '25',
    });
    assert.deepEqual(
      down.map((r) => r.amount),
      ['250.0000', '250.0000', '250.0000', '250.0000'],
    );
    const odd = splitInstallments({
      total: '100.0000',
      count: 6,
      firstDue: '2026-05-01',
      unit: 'week',
      every: 1,
      downPaymentPercent: '10',
    });
    assert.equal(odd[0]?.amount, '10.0000');
    assert.ok(Money.sum(odd.map((r) => Money.parse(r.amount))).eq('100.0000'), 'sum is exact');
    const st = installmentStatuses(down, '300.0000', '2026-06-15');
    assert.deepEqual(
      st.map((r) => r.state),
      ['paid', 'overdue', 'pending', 'pending'],
    );
    assert.equal(st[1]?.outstanding, '200.0000', 'the second part is partly covered');
    assert.equal(installmentStatuses(down, '0', '2026-04-01')[0]?.state, 'pending');
    assert.equal(
      installmentStatuses(down, '1000', '2030-01-01').every((r) => r.state === 'paid'),
      true,
    );
    assert.deepEqual(planProblems(rows, '100.0000', '2026-01-01'), []);
    assert.ok(planProblems(rows, '99.0000', '2026-01-01').length > 0, 'wrong total');
    assert.ok(
      planProblems(rows.slice(0, 1), '33.3333', '2026-01-01').length > 0,
      'one part is not a plan',
    );
    assert.ok(
      planProblems(rows, '100.0000', '2026-02-01').length > 0,
      'due before the invoice date',
    );
    assert.ok(
      installmentPlanSchema.safeParse({
        mode: 'even',
        count: 3,
        firstDue: '2026-01-01',
        unit: 'month',
        every: 1,
        downPaymentPercent: '100',
      }).success === false,
      'a 100 percent down payment is refused',
    );
    assert.ok(
      installmentPlanSchema.safeParse({
        mode: 'custom',
        rows: [{ dueDate: '2026-01-01', amount: '5' }],
      }).success === false,
      'two parts at least',
    );
  });

  await check('reminder ladder, quiet hours and business days', () => {
    const steps = [-3, 0, 7, 14, 30];
    assert.deepEqual(dueSteps('2026-06-10', '2026-06-07', steps, new Set()), {
      send: -3,
      skip: [],
    });
    assert.deepEqual(
      dueSteps('2026-06-10', '2026-06-06', steps, new Set()),
      { send: null, skip: [] },
      'too early',
    );
    assert.deepEqual(dueSteps('2026-06-10', '2026-06-10', steps, new Set(['-3'])), {
      send: 0,
      skip: [],
    });
    assert.deepEqual(dueSteps('2026-06-10', '2026-06-17', steps, new Set(['-3', '0'])), {
      send: 7,
      skip: [],
    });
    assert.deepEqual(
      dueSteps('2026-06-10', '2026-06-18', steps, new Set(['-3', '0'])),
      { send: 7, skip: [] },
      'one day late is still sent',
    );
    assert.deepEqual(
      dueSteps('2026-06-10', '2026-06-22', steps, new Set()),
      { send: null, skip: [-3, 0, 7] },
      'old steps are skipped, not sent',
    );
    assert.deepEqual(
      dueSteps('2026-06-10', '2026-06-24', steps, new Set()),
      { send: 14, skip: [-3, 0, 7] },
      'only the newest step goes out',
    );
    assert.deepEqual(
      dueSteps('2026-06-10', '2026-06-17', steps, new Set(['-3', '0', '7'])),
      { send: null, skip: [] },
      'each step once',
    );
    assert.equal(stageOf(-3), 'before');
    assert.equal(stageOf(0), 'due');
    assert.equal(stageOf(7), 'overdue');
    assert.equal(stageOf(30), 'final');
    assert.ok(
      isQuietHour(22, 20, 8) &&
        isQuietHour(3, 20, 8) &&
        !isQuietHour(12, 20, 8) &&
        !isQuietHour(8, 20, 8),
    );
    assert.ok(!isQuietHour(5, 9, 9), 'equal hours mean no quiet time');
    assert.ok(isQuietHour(10, 9, 17) && !isQuietHour(17, 9, 17));
    assert.ok(
      isBusinessDay('2026-06-08') && !isBusinessDay('2026-06-13') && !isBusinessDay('2026-06-14'),
    );
    assert.deepEqual(normalizeSteps([30, 0, 0, -3, 9999, 1.5]), [-3, 0, 30]);
    assert.ok(
      !reminderSettingsSchema.safeParse({
        enabled: true,
        steps: [0],
        quietStart: 24,
        quietEnd: 8,
        businessDaysOnly: true,
        ccOwner: false,
        message: '',
      }).success,
    );
    const hold = { kind: 'promise', untilDate: null, note: '' };
    assert.ok(!holdSchema.safeParse(hold).success, 'a promise needs a date');
    assert.ok(holdSchema.safeParse({ kind: 'pause', untilDate: null, note: '' }).success);
  });

  await check('late fee periods, caps and settings', () => {
    const rule: LateRule = {
      kind: 'percent',
      value: '2',
      repeat: 'monthly',
      graceDays: 5,
      capPercent: '5',
      capAmount: null,
    };
    assert.deepEqual(periodsDue('2026-01-01', '2026-01-06', rule), [], 'inside the grace days');
    assert.deepEqual(periodsDue('2026-01-01', '2026-01-07', rule), ['m1']);
    assert.deepEqual(periodsDue('2026-01-01', '2026-02-05', rule), ['m1']);
    assert.deepEqual(periodsDue('2026-01-01', '2026-02-06', rule), ['m1', 'm2']);
    assert.deepEqual(periodsDue('2026-01-01', '2026-06-01', { ...rule, repeat: 'once' }), ['m1']);
    const total = Money.parse('1000');
    const fee1 = lateFeeAmount(rule, Money.parse('1000'), total, Money.zero());
    assert.equal(fee1.toDbString(), '20.0000', '2 percent of 1000');
    const fee3 = lateFeeAmount(rule, Money.parse('1000'), total, Money.parse('40'));
    assert.equal(fee3.toDbString(), '10.0000', 'the 5 percent cap (50) leaves 10');
    assert.ok(
      lateFeeAmount(rule, Money.parse('1000'), total, Money.parse('50')).isZero(),
      'cap reached',
    );
    assert.equal(
      lateFeeAmount(
        { ...rule, kind: 'fixed', value: '35', capPercent: null, capAmount: '60' },
        Money.parse('200'),
        total,
        Money.parse('35'),
      ).toDbString(),
      '25.0000',
      'fixed fee limited by the amount cap',
    );
    assert.ok(
      lateFeeAmount(rule, Money.zero(), total, Money.zero()).isZero(),
      'nothing unpaid, no fee',
    );
    const ok = {
      enabled: true,
      kind: 'percent',
      value: '1.5',
      repeat: 'monthly',
      graceDays: 5,
      capPercent: '25',
      capAmount: null,
      autoApply: false,
      label: 'Late fee',
    };
    assert.ok(lateFeeSettingsSchema.safeParse(ok).success);
    assert.ok(
      !lateFeeSettingsSchema.safeParse({ ...ok, value: '101' }).success,
      'percent above 100',
    );
    assert.ok(lateFeeSettingsSchema.safeParse({ ...ok, kind: 'fixed', value: '101' }).success);
    assert.ok(!lateFeeSettingsSchema.safeParse({ ...ok, capPercent: '0' }).success);
    assert.ok(!lateFeeSettingsSchema.safeParse({ ...ok, value: '-1' }).success);
    assert.ok(
      !feeDecisionSchema.safeParse({ action: 'waive', reason: '' }).success,
      'waiving needs a reason',
    );
    assert.ok(feeDecisionSchema.safeParse({ action: 'apply', reason: '' }).success);
    assert.ok(writeOffSchema.safeParse({ amount: '10', reason: 'Client closed down' }).success);
    assert.ok(
      !writeOffSchema.safeParse({ amount: '10', reason: 'short' }).success,
      'a real reason',
    );
    assert.ok(!writeOffSchema.safeParse({ amount: '0', reason: 'Client closed down' }).success);
    const names = new Map(registered.map((p) => [p.action, p]));
    assert.deepEqual(names.get('invoice.writeoff')?.defaultRoles, ['owner']);
    assert.deepEqual(names.get('latefee.manage')?.defaultRoles, ['owner']);
    assert.deepEqual(names.get('reminder.send')?.defaultRoles, ['owner', 'staff']);
  });

  await check('timer rounding, weeks, rates and budgets', () => {
    const t0 = new Date('2026-03-02T09:00:00Z');
    const after = (minutes: number, seconds = 0): Date =>
      new Date(t0.getTime() + minutes * 60_000 + seconds * 1000);
    assert.equal(timerHours(t0, after(90), 0), '1.50');
    assert.equal(timerHours(t0, after(0, 10), 0), '0.02', 'ten seconds count as one minute');
    assert.equal(timerHours(t0, after(37), 15), '0.75', 'rounded up to 15 minutes');
    assert.equal(timerHours(t0, after(60), 15), '1.00');
    assert.equal(timerHours(t0, after(61), 15), '1.25');
    assert.equal(timerHours(t0, after(20), 6), '0.40');
    assert.equal(timerHours(t0, after(30 * 60), 0), '24.00', 'a forgotten timer is cut at one day');
    assert.equal(weekStart('2026-03-02'), '2026-03-02');
    assert.equal(
      weekStart('2026-03-08'),
      '2026-03-02',
      'Sunday belongs to the week that began on Monday',
    );
    assert.equal(weekStart('2026-03-01'), '2026-02-23');
    assert.equal(weekDays('2026-02-23')[6], '2026-03-01');
    assert.equal(entryRate('120', '90'), '120.0000');
    assert.equal(entryRate(null, '90'), '90.0000');
    assert.equal(entryRate(null, null), '0.0000');
    assert.equal(entryAmount('1.25', '80').toDbString(), '100.0000');
    assert.equal(entryAmount('0.33', '10').toDbString(), '3.3000');
    assert.equal(budgetUse('100', null, '50', '0').level, 'ok');
    assert.equal(budgetUse('100', null, '80', '0').level, 'warn');
    assert.equal(budgetUse('100', '5000', '10', '5000').level, 'over', 'either budget can run out');
    assert.equal(budgetUse('100', null, '12.5', '0').hoursPercent, '12.50');
    assert.equal(budgetUse(null, null, '12.5', '0').hoursPercent, null);
  });

  await check('project and time input', () => {
    assert.ok(
      hoursText.safeParse('1.5').success &&
        hoursText.safeParse('24').success &&
        hoursText.safeParse('0.25').success,
    );
    assert.ok(
      !hoursText.safeParse('0').success &&
        !hoursText.safeParse('24.01').success &&
        !hoursText.safeParse('1.255').success &&
        !hoursText.safeParse('-1').success,
    );
    const id = '0190c1a0-0000-7000-8000-000000000001';
    const project = {
      name: 'Website',
      code: 'WEB',
      description: '',
      clientId: id,
      status: 'active',
      billingType: 'hourly',
      defaultRate: '90',
      fixedFee: null,
      retainerHours: null,
      budgetHours: '200',
      budgetAmount: null,
      startDate: '2026-01-01',
      endDate: null,
    };
    assert.ok(projectInputSchema.safeParse(project).success);
    assert.ok(
      !projectInputSchema.safeParse({ ...project, billingType: 'fixed' }).success,
      'a fixed fee project needs the fee',
    );
    assert.ok(
      projectInputSchema.safeParse({ ...project, billingType: 'fixed', fixedFee: '5000' }).success,
    );
    assert.ok(
      !projectInputSchema.safeParse({ ...project, billingType: 'retainer' }).success,
      'a retainer needs hours',
    );
    assert.ok(
      !projectInputSchema.safeParse({ ...project, clientId: null }).success,
      'a billed project needs a client',
    );
    assert.ok(
      projectInputSchema.safeParse({ ...project, clientId: null, billingType: 'non_billable' })
        .success,
    );
    assert.ok(!projectInputSchema.safeParse({ ...project, endDate: '2025-01-01' }).success);
    assert.ok(!projectInputSchema.safeParse({ ...project, code: 'bad code' }).success);
    assert.equal(BILLING_TYPES.length, 4);
    assert.ok(memberInputSchema.safeParse({ userId: id, role: 'manager', rate: null }).success);
    assert.ok(!memberInputSchema.safeParse({ userId: id, role: 'boss', rate: null }).success);
    assert.ok(
      timeEntryInputSchema.safeParse({
        projectId: id,
        workDate: '2026-03-02',
        hours: '2',
        description: '',
        billable: true,
        milestoneId: null,
      }).success,
    );
    assert.ok(
      !timeEntryInputSchema.safeParse({
        projectId: id,
        workDate: '2026-03-02',
        hours: '25',
        description: '',
        billable: true,
        milestoneId: null,
      }).success,
    );
    assert.ok(
      !timeDecisionSchema.safeParse({ ids: [id], action: 'reject', reason: '' }).success,
      'a rejection needs a reason',
    );
    assert.ok(timeDecisionSchema.safeParse({ ids: [id], action: 'approve', reason: '' }).success);
    assert.ok(
      timeSettingsSchema.safeParse({
        requireApproval: true,
        roundMinutes: 15,
        lockThrough: null,
        expectedVersion: 0,
      }).success,
    );
    assert.ok(
      !timeSettingsSchema.safeParse({
        requireApproval: true,
        roundMinutes: 7,
        lockThrough: null,
        expectedVersion: 0,
      }).success,
    );
    const names = new Map(registered.map((p) => [p.action, p]));
    assert.deepEqual(names.get('time.settings')?.defaultRoles, ['owner']);
    assert.deepEqual(names.get('time.log')?.defaultRoles, ['owner', 'staff']);
  });

  await check('project invoice lines', () => {
    const base = blankLine(['VAT10']);
    const names = new Map([
      ['u1', 'Ann'],
      ['u2', 'Bob'],
    ]);
    const claimed: Claimed[] = [
      {
        id: 'a',
        workDate: '2026-03-02',
        userId: 'u1',
        hours: '2.00',
        rate: '100.0000',
        description: 'Design',
      },
      {
        id: 'b',
        workDate: '2026-03-02',
        userId: 'u2',
        hours: '1.50',
        rate: '80.0000',
        description: 'Code',
      },
      {
        id: 'c',
        workDate: '2026-03-03',
        userId: 'u1',
        hours: '0.50',
        rate: '100.0000',
        description: '',
      },
    ];
    const per = hourLines(base, claimed, 'entry', null, 'Web', names);
    assert.equal(per.length, 3);
    assert.equal(per[0]?.quantity, '2.00');
    assert.equal(per[0]?.unitPrice, '100.0000');
    assert.ok(per[0]?.description.includes('Ann') && per[0]?.description.includes('Design'));
    assert.deepEqual(per[0]?.taxCodes, ['VAT10'], 'default tax codes are kept');
    const day = hourLines(base, claimed, 'day', null, 'Web', names);
    assert.equal(day.length, 3, 'same day with different rates stays on two lines');
    const dayOverride = hourLines(base, claimed, 'day', '90', 'Web', names);
    assert.equal(dayOverride.length, 2, 'one rate for the whole invoice merges the day');
    assert.equal(dayOverride[0]?.quantity, '3.50');
    assert.equal(dayOverride[0]?.unitPrice, '90.0000');
    const person = hourLines(base, claimed, 'person', null, 'Web', names);
    assert.deepEqual(person.map((l) => l.quantity).sort(), ['1.50', '2.50']);
    const single = hourLines(base, claimed, 'single', '100', 'Web', names);
    assert.equal(single.length, 1);
    assert.equal(single[0]?.quantity, '4.00');
    const split = retainerSplit(Money.parse('13.5'), '10');
    assert.equal(split.over.toDbString(), '3.5000');
    assert.equal(
      retainerSplit(Money.parse('7'), '10').over.toDbString(),
      '0.0000',
      'under the retainer nothing extra',
    );
    const id = '0190c1a0-0000-7000-8000-000000000001';
    const bill = {
      entryIds: [id],
      milestoneIds: [],
      expenseIds: [],
      grouping: 'day',
      rateOverride: null,
      retainerFrom: null,
      retainerTo: null,
    };
    assert.ok(billInputSchema.safeParse(bill).success);
    assert.ok(
      !billInputSchema.safeParse({ ...bill, entryIds: [] }).success,
      'choose something to bill',
    );
    assert.ok(
      !billInputSchema.safeParse({ ...bill, retainerFrom: '2026-03-01' }).success,
      'both dates',
    );
    assert.ok(
      !billInputSchema.safeParse({ ...bill, retainerFrom: '2026-03-05', retainerTo: '2026-03-01' })
        .success,
    );
    assert.ok(!billInputSchema.safeParse({ ...bill, grouping: 'week' }).success);
  });

  await check('dashboard ranges, comparison and layout', () => {
    assert.deepEqual(rangeFor('month', '2026-02-14'), { from: '2026-02-01', to: '2026-02-28' });
    assert.deepEqual(
      rangeFor('month', '2028-02-14'),
      { from: '2028-02-01', to: '2028-02-29' },
      'leap year',
    );
    assert.deepEqual(rangeFor('last_month', '2026-01-10'), {
      from: '2025-12-01',
      to: '2025-12-31',
    });
    assert.deepEqual(rangeFor('quarter', '2026-05-20'), { from: '2026-04-01', to: '2026-06-30' });
    assert.deepEqual(rangeFor('quarter', '2026-12-31'), { from: '2026-10-01', to: '2026-12-31' });
    assert.deepEqual(rangeFor('year', '2026-05-20'), { from: '2026-01-01', to: '2026-12-31' });
    assert.deepEqual(rangeFor('last_year', '2026-05-20'), { from: '2025-01-01', to: '2025-12-31' });
    assert.deepEqual(rangeFor('last_30', '2026-03-10'), { from: '2026-02-09', to: '2026-03-10' });
    assert.deepEqual(previousRange('month', rangeFor('month', '2026-01-05')), {
      from: '2025-12-01',
      to: '2025-12-31',
    });
    assert.deepEqual(previousRange('quarter', rangeFor('quarter', '2026-02-05')), {
      from: '2025-10-01',
      to: '2025-12-31',
    });
    assert.deepEqual(previousRange('quarter', rangeFor('quarter', '2026-08-05')), {
      from: '2026-04-01',
      to: '2026-06-30',
    });
    assert.deepEqual(previousRange('year', rangeFor('year', '2026-08-05')), {
      from: '2025-01-01',
      to: '2025-12-31',
    });
    assert.deepEqual(previousRange('last_30', rangeFor('last_30', '2026-03-10')), {
      from: '2026-01-10',
      to: '2026-02-08',
    });
    for (const k of RANGE_KEYS) {
      const r = rangeFor(k, '2026-07-04');
      assert.ok(r.from <= r.to, k);
      assert.ok(previousRange(k, r).to < r.from, `${k} previous ends before this starts`);
    }
    assert.equal(changePercent('150', '100'), '50.00');
    assert.equal(changePercent('50', '100'), '-50.00');
    assert.equal(changePercent('100', '0'), null, 'nothing to compare with');
    assert.equal(changePercent('100.3333', '100'), '0.33');
    const allowed = new Set<WidgetId>(WIDGET_IDS.filter((id) => id !== 'time'));
    assert.deepEqual(
      normalizeLayout(
        [
          { id: 'chart', visible: false },
          { id: 'cards', visible: true },
        ],
        allowed,
      )
        .map((w) => w.id)
        .slice(0, 2),
      ['chart', 'cards'],
      'saved order is kept',
    );
    assert.equal(normalizeLayout([], allowed).length, allowed.size, 'new widgets are added');
    assert.ok(
      !normalizeLayout([{ id: 'time', visible: true }], allowed).some((w) => w.id === 'time'),
      'not allowed is dropped',
    );
    assert.ok(
      normalizeLayout('garbage', allowed).length === allowed.size,
      'a broken layout falls back',
    );
    assert.ok(
      !layoutSchema.safeParse({
        widgets: [
          { id: 'cards', visible: true },
          { id: 'cards', visible: false },
        ],
      }).success,
      'once each',
    );
    assert.ok(!layoutSchema.safeParse({ widgets: [{ id: 'weather', visible: true }] }).success);
    const moved = moveWidget(defaultLayout(), 'chart', -1);
    assert.equal(moved[2]?.id, 'chart');
    assert.deepEqual(
      moveWidget(defaultLayout(), 'search', -1),
      defaultLayout(),
      'the first cannot move up',
    );
  });

  await check('report sums (hand-calculated)', () => {
    const inv = (o: Partial<InvoiceFact>): InvoiceFact => ({
      id: 'i',
      number: 'INV-1',
      clientId: 'c1',
      clientName: 'Acme',
      kind: 'invoice',
      status: 'sent',
      issueDate: '2026-01-10',
      dueDate: '2026-02-09',
      sentAt: '2026-01-10T10:00:00Z',
      total: '0',
      taxTotal: '0',
      amountDue: '0',
      amountPaid: '0',
      taxBreakdown: [],
      projectId: null,
      ...o,
    });
    const invoices: InvoiceFact[] = [
      inv({
        id: 'a',
        number: 'INV-1',
        total: '1100.0000',
        taxTotal: '100.0000',
        amountDue: '1100',
        amountPaid: '400',
        taxBreakdown: [{ code: 'VAT10', rate: '10.0000', base: '1000', amount: '100' }],
      }),
      inv({
        id: 'b',
        number: 'INV-2',
        clientId: 'c2',
        clientName: 'Beta',
        total: '550.5000',
        taxTotal: '50.0000',
        amountDue: '550.5',
        amountPaid: '550.5',
        status: 'paid',
        sentAt: '2026-02-03T09:00:00Z',
        issueDate: '2026-02-03',
        dueDate: '2026-03-05',
        taxBreakdown: [{ code: 'VAT10', rate: '10.0000', base: '500.5', amount: '50' }],
      }),
      inv({
        id: 'c',
        number: 'INV-3',
        total: '200',
        amountDue: '200',
        status: 'void',
        sentAt: '2026-02-05T09:00:00Z',
        issueDate: '2026-02-05',
      }),
      inv({
        id: 'd',
        number: null,
        total: '70',
        status: 'draft',
        sentAt: null,
        issueDate: '2026-02-06',
      }),
      inv({
        id: 'e',
        number: 'INV-4',
        total: '300',
        amountDue: '300',
        status: 'overdue',
        sentAt: '2026-02-20T09:00:00Z',
        issueDate: '2026-02-20',
        dueDate: '2026-02-25',
      }),
    ];
    const credits: CreditFact[] = [
      {
        id: 'n1',
        number: 'CN-1',
        clientName: 'Acme',
        invoiceNumber: 'INV-1',
        issueDate: '2026-02-10',
        status: 'issued',
        reason: 'return',
        total: '110.0000',
        taxTotal: '10.0000',
        appliedAmount: '110',
        taxBreakdown: [{ code: 'VAT10', rate: '10.0000', base: '100', amount: '10' }],
      },
      {
        id: 'n2',
        number: 'CN-2',
        clientName: 'Acme',
        invoiceNumber: 'INV-1',
        issueDate: '2026-02-11',
        status: 'void',
        reason: 'other',
        total: '50',
        taxTotal: '0',
        appliedAmount: '0',
        taxBreakdown: [],
      },
    ];
    const sales = salesSummary(invoices, credits, '2026-01-01', '2026-02-28');
    assert.deepEqual(
      sales.rows.map((r) => [r.month, r.count, r.sales, r.credits, r.net]),
      [
        ['2026-01', '1', '1100.0000', '0.0000', '1100.0000'],
        ['2026-02', '2', '850.5000', '110.0000', '740.5000'],
      ],
      'void and draft invoices are not sales; void credit notes do not count',
    );
    assert.equal(sales.totals?.sales, '1950.5000');
    assert.equal(sales.totals?.net, '1840.5000');
    assert.equal(sales.totals?.count, '3');
    const tax = taxSummary(invoices, credits, '2026-01-01', '2026-02-28');
    assert.deepEqual(tax.rows[0], {
      code: 'VAT10',
      rate: '10',
      base: '1500.5000',
      tax: '150.0000',
      creditTax: '10.0000',
      net: '140.0000',
    });
    const payments = [
      {
        id: 'p1',
        invoiceNumber: 'INV-1',
        clientName: 'Acme',
        amount: '400',
        at: '2026-01-20T10:00:00Z',
      },
      {
        id: 'p2',
        invoiceNumber: 'INV-2',
        clientName: 'Beta',
        amount: '550.5',
        at: '2026-02-04T10:00:00Z',
      },
    ];
    const byClient = revenueByClient(invoices, payments, '2026-01-01', '2026-02-28');
    assert.deepEqual(
      byClient.rows.map((r) => [r.client, r.invoiced, r.collected, r.open]),
      [
        ['Acme', '1400.0000', '400.0000', '1000.0000'],
        ['Beta', '550.5000', '550.5000', '0.0000'],
      ],
      'Acme: INV-1 1100 plus INV-4 300, unpaid 700 + 300',
    );
    assert.equal(paymentsReceived(payments, '2026-01-01', '2026-01-31').totals?.amount, '400.0000');
    const aging = receivablesAging(invoices, '2026-03-01');
    assert.equal(agingBucket('2026-03-02', '2026-03-01'), 'current');
    assert.equal(agingBucket('2026-03-01', '2026-03-01'), 'current');
    assert.equal(agingBucket('2026-02-28', '2026-03-01'), 'd1_30');
    assert.equal(agingBucket('2026-01-31', '2026-03-01'), 'd1_30');
    assert.equal(
      agingBucket('2026-01-30', '2026-03-01'),
      'd1_30',
      '30 days late is still in the first bucket',
    );
    assert.equal(agingBucket('2026-01-29', '2026-03-01'), 'd31_60');
    assert.equal(agingBucket('2025-11-01', '2026-03-01'), 'd90_plus');
    assert.equal(
      aging.rows.length,
      2,
      'INV-1 (700 unpaid) and INV-4 (300); paid, void and draft are left out',
    );
    assert.equal(aging.totals?.balance, '1000.0000');
    assert.equal(
      aging.totals?.d1_30,
      '1000.0000',
      'INV-1 is 20 days late and INV-4 is 4 days late',
    );
    assert.equal(aging.totals?.d31_60, '0.0000');
    const status = statusSummary(invoices, '2026-01-01', '2026-02-28');
    assert.deepEqual(
      status.rows.map((r) => [r.status, r.count, r.total, r.unpaid]),
      [
        ['draft', '1', '70.0000', '0.0000'],
        ['overdue', '1', '300.0000', '300.0000'],
        ['paid', '1', '550.5000', '0.0000'],
        ['sent', '1', '1100.0000', '700.0000'],
        ['void', '1', '200.0000', '0.0000'],
      ],
    );
    const items = revenueByItem(
      [
        {
          sku: 'A1',
          description: 'Design',
          quantity: '2',
          net: '200',
          tax: '20',
          lineTotal: '220',
        },
        {
          sku: 'A1',
          description: 'design',
          quantity: '1.5',
          net: '150',
          tax: '15',
          lineTotal: '165',
        },
        {
          sku: '',
          description: 'Hosting',
          quantity: '1',
          net: '99.99',
          tax: '0',
          lineTotal: '99.99',
        },
      ],
      '2026-01-01',
      '2026-01-31',
    );
    assert.deepEqual(
      items.rows.map((r) => [r.description, r.quantity, r.net]),
      [
        ['Design', '3.50', '350.0000'],
        ['Hosting', '1.00', '99.9900'],
      ],
      'same SKU and name (any case) are added',
    );
    assert.equal(items.totals?.total, '484.9900');
    const credit = creditsReport(credits, '2026-02-01', '2026-02-28');
    assert.equal(credit.totals?.total, '110.0000', 'void credit notes are listed but not counted');
    assert.equal(credit.rows.length, 2);
  });

  await check('report time sums, comparison and schedules', () => {
    const time = timeSummary(
      [
        {
          projectId: 'p1',
          projectName: 'Web',
          userId: 'u1',
          userName: 'Ann',
          hours: '2.50',
          billable: true,
          rate: '100',
          status: 'approved',
        },
        {
          projectId: 'p1',
          projectName: 'Web',
          userId: 'u2',
          userName: 'Bob',
          hours: '1.00',
          billable: false,
          rate: '0',
          status: 'draft',
        },
        {
          projectId: 'p2',
          projectName: 'App',
          userId: 'u1',
          userName: 'Ann',
          hours: '4.00',
          billable: true,
          rate: '80',
          status: 'invoiced',
        },
        {
          projectId: 'p2',
          projectName: 'App',
          userId: 'u1',
          userName: 'Ann',
          hours: '9.00',
          billable: true,
          rate: '80',
          status: 'rejected',
        },
      ],
      'project',
      '2026-01-01',
      '2026-01-31',
    );
    assert.deepEqual(
      time.rows.map((r) => [r.name, r.hours, r.billable, r.share, r.value, r.unbilled]),
      [
        ['App', '4.00', '4.00', '100.00', '320.0000', '0.0000'],
        ['Web', '3.50', '2.50', '71.42', '250.0000', '250.0000'],
      ],
      'rejected time is left out; 2.5 of 3.5 hours is 71.42 percent',
    );
    assert.equal(time.totals?.hours, '7.50');
    assert.equal(
      timeSummary([], 'person', 'a', 'b').totals?.share,
      '0.00',
      'no hours, no division by zero',
    );
    const funnel = estimatesFunnel(
      [
        { status: 'sent', total: '100' },
        { status: 'accepted', total: '200' },
        { status: 'converted', total: '300' },
        { status: 'declined', total: '50' },
        { status: 'draft', total: '999' },
      ],
      'a',
      'b',
    );
    assert.ok(funnel.notes[0]?.includes('50.00%'), 'two of four sent estimates were won');
    const mk = (sales: string, credits: string): ReturnType<typeof salesSummary> => ({
      ...salesSummary([], [], '2026-01-01', '2026-01-31'),
      totals: { month: 'Total', count: '1', sales, tax: '0', credits, net: sales },
    });
    const rows = compareTotals(mk('850.5000', '110.0000'), mk('1100.0000', '0.0000'));
    assert.equal(rows.find((r) => r.key === 'sales')?.change, '-22.68', '850.50 against 1100.00');
    assert.equal(rows.find((r) => r.key === 'credits')?.change, null, 'nothing to compare with');
    assert.ok(!rows.some((r) => r.key === 'month'), 'text columns are not compared');
    assert.equal(nextRun('weekly', 1, null, '2026-03-01'), '2026-03-02');
    assert.equal(nextRun('weekly', 1, null, '2026-03-02'), '2026-03-09', 'strictly after');
    assert.equal(nextRun('weekly', 7, null, '2026-03-02'), '2026-03-08');
    assert.equal(nextRun('monthly', null, 15, '2026-03-10'), '2026-03-15');
    assert.equal(nextRun('monthly', null, 15, '2026-03-15'), '2026-04-15');
    assert.equal(nextRun('monthly', null, 1, '2026-12-20'), '2027-01-01');
    assert.equal(nextRun('monthly', null, 28, '2026-02-28'), '2026-03-28');
  });

  await check('report files and options', () => {
    const run = salesSummary([], [], '2026-01-01', '2026-01-31');
    const csv = csvOf(
      {
        ...run,
        rows: [
          {
            month: '=SUM(A1)',
            count: '1',
            sales: '-5.5000',
            tax: '0',
            credits: '0',
            net: '-5.5000',
          },
        ],
      },
      ['t', 'p', 'KD-EXPORT x'],
    );
    assert.ok(
      csv.startsWith(String.fromCharCode(0xfeff)),
      'a byte order mark so Excel reads UTF-8',
    );
    assert.ok(csv.includes("'=SUM(A1)"), 'a formula in a cell is neutralised');
    assert.ok(csv.includes('-5.5000'), 'negative numbers stay numbers');
    assert.ok(csv.includes('KD-EXPORT x'), 'the export line is present');
    const xlsx = buildXlsx({
      sheetName: 'A/B',
      columns: [
        { key: 'a', label: 'A', type: 'text' },
        { key: 'b', label: 'B', type: 'money' },
      ],
      rows: [{ a: '<&>', b: '1.5000' }],
      totals: { a: 'Total', b: '1.5000' },
      titleLines: ['x'],
    });
    assert.equal(xlsx[0], 0x50);
    assert.equal(xlsx[1], 0x4b, 'a zip file starts with PK');
    const text = Buffer.from(xlsx).toString('latin1');
    assert.ok(text.includes('xl/worksheets/sheet1.xml') && text.includes('[Content_Types].xml'));
    assert.ok(text.includes('&lt;&amp;&gt;'), 'text is escaped');
    assert.equal(zipStore([]).length, 22, 'an empty zip is the end record only');
    assert.ok(reportParamsSchema.safeParse({ range: 'month' }).success);
    assert.ok(!reportParamsSchema.safeParse({ from: '2026-01-01' }).success, 'both dates');
    assert.ok(!reportParamsSchema.safeParse({ from: '2026-02-01', to: '2026-01-01' }).success);
    assert.ok(
      !reportParamsSchema.safeParse({ from: '2020-01-01', to: '2026-01-01' }).success,
      'three years at most',
    );
    const rp = resolveParams({ range: 'last_month' }, '2026-03-10');
    assert.deepEqual(
      [rp.from, rp.to, rp.previous.from, rp.previous.to],
      ['2026-02-01', '2026-02-28', '2026-01-01', '2026-01-31'],
    );
    const base = {
      reportKey: 'sales_summary',
      name: 'Monthly',
      range: 'last_month',
      format: 'pdf',
      frequency: 'monthly',
      weekday: null,
      monthDay: 1,
      recipients: ['Owner@Example.com'],
      enabled: true,
    };
    const parsed = scheduleInputSchema.parse(base);
    assert.deepEqual(parsed.recipients, ['owner@example.com'], 'addresses are lower-cased');
    assert.ok(!scheduleInputSchema.safeParse({ ...base, monthDay: 29 }).success);
    assert.ok(
      !scheduleInputSchema.safeParse({ ...base, frequency: 'weekly' }).success,
      'a weekly schedule needs a weekday',
    );
    assert.ok(!scheduleInputSchema.safeParse({ ...base, recipients: [] }).success);
    assert.ok(!scheduleInputSchema.safeParse({ ...base, recipients: ['not an address'] }).success);
    assert.ok(!scheduleInputSchema.safeParse({ ...base, range: 'whenever' }).success);
    const names = new Map(registered.map((p) => [p.action, p]));
    assert.deepEqual(names.get('report.read')?.defaultRoles, ['owner']);
    assert.ok(names.has('report.export') && names.has('report.schedule'));
  });

  await check('batch input, progress and error handling', () => {
    const id = '0190c1a0-0000-7000-8000-000000000001';
    const id2 = '0190c1a0-0000-7000-8000-000000000002';
    assert.ok(
      batchCreateSchema.safeParse({
        action: 'send',
        invoiceIds: [id],
        confirmDuplicate: false,
        message: '',
        runAfter: null,
      }).success,
    );
    const dedup = batchCreateSchema.parse({
      action: 'trash',
      invoiceIds: [id, id, id2],
      runAfter: null,
    });
    assert.deepEqual(
      dedup.action === 'trash' ? dedup.invoiceIds : [],
      [id, id2],
      'the same invoice is listed once',
    );
    assert.ok(
      !batchCreateSchema.safeParse({ action: 'trash', invoiceIds: [], runAfter: null }).success,
      'at least one invoice',
    );
    assert.ok(
      !batchCreateSchema.safeParse({
        action: 'void',
        invoiceIds: [id],
        reason: 'ok',
        acknowledgePayments: true,
        runAfter: null,
      }).success,
      'a real reason',
    );
    assert.ok(
      !batchCreateSchema.safeParse({
        action: 'void',
        invoiceIds: [id],
        reason: 'Wrong client',
        runAfter: null,
      }).success,
      'void must say whether payments are acknowledged',
    );
    assert.ok(
      !batchCreateSchema.safeParse({ action: 'delete', invoiceIds: [id], runAfter: null }).success,
      'known actions',
    );
    const many = Array.from(
      { length: 501 },
      (_, i) => `0190c1a0-0000-7000-8000-${String(i).padStart(12, '0')}`,
    );
    assert.ok(
      !batchCreateSchema.safeParse({ action: 'trash', invoiceIds: many, runAfter: null }).success,
      'at most 500',
    );
    assert.ok(
      !batchCreateSchema.safeParse({
        action: 'trash',
        invoiceIds: [id],
        runAfter: new Date(Date.now() + 200 * 86_400_000).toISOString(),
      }).success,
      'not months ahead',
    );
    assert.ok(
      batchCreateSchema.safeParse({
        action: 'trash',
        invoiceIds: [id],
        runAfter: new Date(Date.now() + 3600_000).toISOString(),
      }).success,
    );
    assert.equal(batchPercent({ total: 200, done: 50, failed: 10, skipped: 40 }), 50);
    assert.equal(batchPercent({ total: 3, done: 1, failed: 0, skipped: 0 }), 33);
    assert.equal(batchPercent({ total: 0, done: 0, failed: 0, skipped: 0 }), 100);
    assert.equal(outcomeOfError(new DuplicateError('similar invoice'), 1).status, 'skipped');
    assert.equal(
      outcomeOfError(new ValidationError('no lines'), 1).status,
      'failed',
      'a problem with the data is not retried',
    );
    assert.equal(outcomeOfError(new ForbiddenError(), 1).status, 'failed');
    assert.equal(outcomeOfError(new NotFoundError(), 1).status, 'failed');
    assert.equal(outcomeOfError(new ConflictError(), 1).status, 'failed');
    assert.equal(
      outcomeOfError(new InternalError(new Error('db down')), 1).status,
      'pending',
      'a server problem is tried again',
    );
    assert.equal(outcomeOfError(new Error('network'), 2).status, 'pending');
    assert.equal(outcomeOfError(new Error('network'), 3).status, 'failed', 'three tries at most');
  });

  if (failures > 0) process.exit(1);
  process.stdout.write('step09-core: ok\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`step09-core crashed: ${String(error)}\n`);
  process.exit(1);
});
