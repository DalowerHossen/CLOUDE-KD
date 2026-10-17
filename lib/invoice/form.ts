// path: lib/invoice/form.ts
// Helpers of the invoice form that need no browser: starting values, a new line, a line from a catalogue item, the
// payment terms that match a number of days, and the live preview of the totals. Safe to import in the browser.
import {
  calculate,
  type CalcLineInput,
  type CalcOptions,
  type CalcResult,
  type TaxRef,
} from './calc';
import type { AddressBlock, InvoiceInput, InvoiceLineInput, InvoiceOptions } from './input';
import { dueDateFor, TERM_DAYS, type PaymentTerms } from './terms';

export const EMPTY_BLOCK: AddressBlock = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  taxLabel: '',
  taxId: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: null,
};

/** The calculation settings a new invoice starts with (the company's tax settings). */
export interface FormDefaults {
  options: Omit<
    InvoiceOptions,
    | 'documentDiscountKind'
    | 'documentDiscountValue'
    | 'shippingAmount'
    | 'shippingTaxable'
    | 'shippingTaxCodes'
  >;
  defaultTaxCodes: readonly string[];
  paymentTerms: PaymentTerms;
  paperSize: 'a4' | 'letter';
}

export function blankLine(defaultTaxCodes: readonly string[]): InvoiceLineInput {
  return {
    productId: null,
    variantId: null,
    sku: '',
    description: '',
    hsCode: '',
    quantity: '1',
    unit: 'unit',
    unitPrice: '0',
    discountKind: 'none',
    discountValue: '0',
    taxExempt: false,
    taxCodes: [...defaultTaxCodes],
  };
}

export interface PickerItemLike {
  id: string;
  variantId: string | null;
  label: string;
  sku: string | null;
  unit: string;
  unitPrice: string;
}

export function lineFromItem(
  item: PickerItemLike,
  defaultTaxCodes: readonly string[],
): InvoiceLineInput {
  return {
    ...blankLine(defaultTaxCodes),
    productId: item.id,
    variantId: item.variantId,
    sku: item.sku ?? '',
    description: item.label,
    unit: item.unit,
    unitPrice: item.unitPrice.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''),
  };
}

export function defaultInput(defaults: FormDefaults, today: string): InvoiceInput {
  return {
    kind: 'invoice',
    clientId: null,
    walkInName: '',
    billTo: EMPTY_BLOCK,
    shipTo: null,
    issueDate: today,
    paymentTerms: defaults.paymentTerms,
    dueDate: dueDateFor(today, defaults.paymentTerms, null),
    poNumber: '',
    notes: '',
    internalNotes: '',
    tags: [],
    category: '',
    projectId: null,
    paperSize: defaults.paperSize,
    template: 'classic',
    displayCurrency: null,
    options: {
      ...defaults.options,
      documentDiscountKind: 'none',
      documentDiscountValue: '0',
      shippingAmount: '0',
      shippingTaxable: false,
      shippingTaxCodes: [...defaults.defaultTaxCodes],
    },
    lines: [],
  };
}

/** The payment terms that match a number of days (a client's usual terms); net 30 when none fits. */
export function termsFromDays(days: number | null): PaymentTerms {
  if (days === null) return 'net_30';
  const exact = (Object.entries(TERM_DAYS) as [Exclude<PaymentTerms, 'custom'>, number][]).find(
    ([, d]) => d === days,
  );
  return exact ? exact[0] : 'custom';
}

export interface Preview {
  result: CalcResult | null;
  error: string | null;
}

/** The totals as the form shows them while typing. The server works them out again when the invoice is saved. */
export function previewTotals(
  input: InvoiceInput,
  rates: readonly { code: string; name: string; rate: string; compound: boolean }[],
): Preview {
  const byCode = new Map<string, TaxRef>(
    rates.map((r) => [r.code, { code: r.code, name: r.name, rate: r.rate, compound: r.compound }]),
  );
  const refs = (codes: readonly string[]): TaxRef[] =>
    codes.flatMap((c) => {
      const ref = byCode.get(c);
      return ref ? [ref] : [];
    });
  try {
    const lines: CalcLineInput[] = input.lines.map((l) => ({
      quantity: l.quantity || '0',
      unitPrice: l.unitPrice || '0',
      discountKind: l.discountKind,
      discountValue: l.discountValue || '0',
      taxExempt: l.taxExempt,
      taxes: refs(l.taxCodes),
    }));
    const options: CalcOptions = {
      priceMode: input.options.priceMode,
      discountOrder: input.options.discountOrder,
      roundingPolicy: input.options.roundingPolicy,
      roundingMode: input.options.roundingMode,
      precision: input.options.precision,
      documentDiscountKind: input.options.documentDiscountKind,
      documentDiscountValue: input.options.documentDiscountValue || '0',
      shippingAmount: input.options.shippingAmount || '0',
      shippingTaxable: input.options.shippingTaxable,
      shippingTaxes: refs(input.options.shippingTaxCodes),
      withholdingRate: input.options.withholdingRate || '0',
      cashRounding: input.options.cashRounding,
    };
    return { result: calculate(lines, options), error: null };
  } catch {
    return { result: null, error: 'invalid' };
  }
}
