// path: lib/pdf/invoice/data.ts
// Everything an invoice PDF shows, as plain data. Built from an invoice (and its frozen seller block); the layout
// component only draws it. Pure.
import type { AddressBlock, InvoiceKind } from '@/lib/invoice/input';
import { convertUsd } from '@/lib/fx/rates';
import { amountInWords } from '@/lib/invoice/words';
import { REVERSE_CHARGE_NOTE } from '@/lib/tax/rules';
import { termsLabel, type PaymentTerms } from '@/lib/invoice/terms';
import { Money } from '@/lib/utils/currency';

export interface PdfSeller {
  name: string;
  legalName: string;
  taxLabel: string;
  taxId: string;
  registrationNumber: string;
  email: string;
  phone: string;
  website: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  primaryColor: string;
  accentColor: string;
  terms: string;
  footer: string;
  remitTo: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    routingNumber: string;
    swift: string;
    iban: string;
    instructions: string;
  } | null;
}

export interface PdfLine {
  position: number;
  sku: string;
  description: string;
  hsCode: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
  tax: string;
  net: string;
  total: string;
}

export interface PdfInvoiceData {
  kind: InvoiceKind;
  title: string;
  /** "Due" on an invoice, "Valid until" on an estimate. */
  dueLabel: string;
  /** "Amount due" on an invoice, "Estimate total" on an estimate. */
  dueTotalLabel: string;
  number: string;
  status: string;
  watermark: 'DRAFT' | 'VOID' | 'PAID' | 'PROFORMA' | null;
  issueDate: string;
  dueDate: string;
  termsLabel: string;
  poNumber: string;
  seller: PdfSeller;
  billTo: AddressBlock;
  shipTo: AddressBlock | null;
  lines: PdfLine[];
  totals: {
    subtotal: string;
    discounts: string;
    shipping: string;
    tax: string;
    rounding: string;
    total: string;
    withheld: string;
    paid: string;
    amountDue: string;
  };
  taxBreakdown: { code: string; rate: string; base: string; amount: string }[];
  notes: string;
  amountInWords: string;
  reverseCharge: boolean;
  taxExempt: boolean;
  display: { currency: string; rate: string; amountDue: string } | null;
  paper: 'LETTER' | 'A4';
  template: 'classic' | 'modern' | 'minimal' | 'detailed';
}

const TITLES: Record<InvoiceKind, string> = {
  invoice: 'INVOICE',
  proforma: 'PROFORMA INVOICE',
  deposit: 'DEPOSIT INVOICE',
  debit_note: 'DEBIT NOTE',
};

/** The part of an invoice view the PDF needs (a subset of `InvoiceView`, so this file stays free of the services). */
export interface PdfSource {
  kind: InvoiceKind;
  number: string | null;
  status: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: PaymentTerms;
  /** Set for other documents drawn with this layout (an estimate). */
  document?: {
    title: string;
    watermark: PdfInvoiceData['watermark'];
    dueLabel: string;
    dueTotalLabel: string;
  };
  poNumber: string;
  seller: Record<string, unknown> | null;
  billTo: AddressBlock;
  walkInName: string;
  shipTo: AddressBlock | null;
  notes: string;
  paperSize: 'a4' | 'letter';
  template: 'classic' | 'modern' | 'minimal' | 'detailed';
  displayCurrency: string | null;
  fxRate: string | null;
  reverseCharge: boolean;
  taxExempt: boolean;
  amountPaid: string;
  totals: {
    subtotal: string;
    lineDiscountTotal: string;
    documentDiscount: string;
    shipping: string;
    shippingTax: string;
    taxTotal: string;
    roundingAdjustment: string;
    total: string;
    withholding: string;
    amountDue: string;
  };
  taxBreakdown: { code: string; rate: string; base: string; amount: string }[];
  lines: {
    position: number;
    sku: string;
    description: string;
    hsCode: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    discountKind: string;
    discountValue: string;
    taxes: { code: string; rate: string }[];
    taxExempt: boolean;
    net: string;
    lineTotal: string;
  }[];
}

const EMPTY_SELLER: PdfSeller = {
  name: '',
  legalName: '',
  taxLabel: '',
  taxId: '',
  registrationNumber: '',
  email: '',
  phone: '',
  website: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: '',
  primaryColor: '#111827',
  accentColor: '#2563eb',
  terms: '',
  footer: '',
  remitTo: null,
};

const trimNumber = (v: string): string =>
  v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v;
const paidWatermark = (s: string): boolean => s === 'paid';

export function buildInvoicePdfData(
  v: PdfSource,
  sellerFallback: Partial<PdfSeller> = {},
): PdfInvoiceData {
  const seller = {
    ...EMPTY_SELLER,
    ...sellerFallback,
    ...((v.seller ?? {}) as Partial<PdfSeller>),
  };
  const discounts = Money.parse(v.totals.lineDiscountTotal).add(v.totals.documentDiscount);
  const paid = Money.parse(v.amountPaid);
  const balance = Money.parse(v.totals.amountDue).sub(paid);
  const watermark: PdfInvoiceData['watermark'] = v.document
    ? v.document.watermark
    : v.status === 'draft' || v.status === 'pending_approval'
      ? 'DRAFT'
      : v.status === 'void'
        ? 'VOID'
        : paidWatermark(v.status)
          ? 'PAID'
          : v.kind === 'proforma'
            ? 'PROFORMA'
            : null;
  return {
    kind: v.kind,
    title: v.document?.title ?? TITLES[v.kind],
    dueLabel: v.document?.dueLabel ?? 'Due',
    dueTotalLabel: v.document?.dueTotalLabel ?? 'Amount due',
    number: v.number ?? 'DRAFT',
    status: v.status,
    watermark,
    issueDate: v.issueDate,
    dueDate: v.dueDate,
    termsLabel: v.document ? '' : termsLabel(v.paymentTerms, v.issueDate, v.dueDate),
    poNumber: v.poNumber,
    seller,
    billTo: { ...v.billTo, name: v.billTo.name || v.walkInName },
    shipTo: v.shipTo,
    lines: v.lines.map((l) => ({
      position: l.position,
      sku: l.sku,
      description: l.description,
      hsCode: l.hsCode,
      quantity: trimNumber(l.quantity),
      unit: l.unit,
      unitPrice: l.unitPrice,
      discount:
        l.discountKind === 'none'
          ? ''
          : l.discountKind === 'percent'
            ? `${trimNumber(l.discountValue)}%`
            : l.discountValue,
      tax: l.taxExempt ? '-' : l.taxes.map((t) => `${trimNumber(t.rate)}%`).join(' + '),
      net: l.net,
      total: l.lineTotal,
    })),
    totals: {
      subtotal: v.totals.subtotal,
      discounts: discounts.toDbString(),
      shipping: Money.parse(v.totals.shipping).toDbString(),
      tax: v.totals.taxTotal,
      rounding: v.totals.roundingAdjustment,
      total: v.totals.total,
      withheld: v.totals.withholding,
      paid: paid.toDbString(),
      amountDue: balance.isNegative() ? '0.0000' : balance.toDbString(),
    },
    taxBreakdown: v.taxBreakdown.map((t) => ({
      code: t.code,
      rate: trimNumber(t.rate),
      base: t.base,
      amount: t.amount,
    })),
    notes: v.notes,
    amountInWords: amountInWords(Money.parse(v.totals.amountDue)),
    reverseCharge: v.reverseCharge,
    taxExempt: v.taxExempt,
    display:
      v.displayCurrency && v.fxRate
        ? {
            currency: v.displayCurrency,
            rate: v.fxRate,
            amountDue: convertUsd(Money.parse(v.totals.amountDue), v.fxRate, v.displayCurrency),
          }
        : null,
    paper: v.paperSize === 'a4' ? 'A4' : 'LETTER',
    template: v.template,
  };
}

export { REVERSE_CHARGE_NOTE };
