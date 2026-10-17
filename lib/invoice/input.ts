// path: lib/invoice/input.ts
// Input of the invoice screens and routes. Safe to import in the browser. The server always works the totals out again
// from the lines; totals sent by a client are never trusted (there is no field for them).
import { z } from 'zod';
import { moneyNonNegative, moneyText, plain } from '@/lib/crm/clients';
import { DISPLAY_CURRENCIES } from '@/lib/company/sections';
import { Money } from '@/lib/utils/currency';
import { CASH_ROUNDING_STEPS, PRECISIONS, ROUNDING_MODES } from './rounding';
import { PAYMENT_TERMS } from './terms';

const uuid = z.string().uuid();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Enter a date.' });
const country = z
  .string()
  .regex(/^[A-Z]{2}$/, { message: 'Use a two-letter country code such as US.' });
const phone = z
  .string()
  .trim()
  .regex(/^[0-9+()\-. ]{0,30}$/, { message: 'Use digits and + ( ) - . only.' });
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
    message: 'Enter a valid e-mail address.',
  });

export const INVOICE_KINDS = ['invoice', 'proforma', 'deposit', 'debit_note'] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
export const MAX_LINES = 2000;

export const addressBlock = z
  .object({
    name: plain(0, 200),
    contactName: plain(0, 200),
    email: optionalEmail,
    phone,
    taxLabel: plain(0, 30),
    taxId: plain(0, 40),
    line1: plain(0, 200),
    line2: plain(0, 200),
    city: plain(0, 100),
    region: plain(0, 100),
    postalCode: plain(0, 20),
    country: country.nullable(),
  })
  .strict();
export type AddressBlock = z.infer<typeof addressBlock>;

export const invoiceLineSchema = z
  .object({
    productId: uuid.nullable(),
    variantId: uuid.nullable(),
    sku: plain(0, 40),
    description: plain(1, 2000),
    hsCode: plain(0, 20),
    quantity: moneyText,
    unit: plain(1, 20),
    unitPrice: moneyText,
    discountKind: z.enum(['none', 'percent', 'fixed']),
    discountValue: moneyNonNegative,
    taxExempt: z.boolean(),
    taxCodes: z.array(z.string().regex(/^[A-Z0-9][A-Z0-9_.-]{0,19}$/)).max(5),
  })
  .strict()
  .refine(
    (v) => {
      if (v.discountKind !== 'percent') return true;
      try {
        return Money.parse(v.discountValue).lte('100');
      } catch {
        return false;
      }
    },
    { message: 'A percentage discount cannot be above 100.', path: ['discountValue'] },
  );
export type InvoiceLineInput = z.infer<typeof invoiceLineSchema>;

export const invoiceOptions = z
  .object({
    priceMode: z.enum(['exclusive', 'inclusive']),
    discountOrder: z.enum(['before_tax', 'after_tax']),
    roundingPolicy: z.enum(['per_line', 'on_total']),
    roundingMode: z.enum(ROUNDING_MODES),
    precision: z
      .union([z.literal(2), z.literal(3), z.literal(4)])
      .refine((v) => PRECISIONS.includes(v)),
    cashRounding: z.enum(CASH_ROUNDING_STEPS),
    documentDiscountKind: z.enum(['none', 'percent', 'fixed']),
    documentDiscountValue: moneyNonNegative,
    shippingAmount: moneyText,
    shippingTaxable: z.boolean(),
    shippingTaxCodes: z.array(z.string().regex(/^[A-Z0-9][A-Z0-9_.-]{0,19}$/)).max(5),
    withholdingRate: moneyNonNegative,
  })
  .strict();
export type InvoiceOptions = z.infer<typeof invoiceOptions>;

export const invoiceInputSchema = z
  .object({
    kind: z.enum(INVOICE_KINDS),
    clientId: uuid.nullable(),
    walkInName: plain(0, 200),
    billTo: addressBlock,
    shipTo: addressBlock.nullable(),
    issueDate: day,
    paymentTerms: z.enum(PAYMENT_TERMS),
    dueDate: day,
    poNumber: plain(0, 60),
    notes: plain(0, 20000),
    internalNotes: plain(0, 20000),
    tags: z
      .array(plain(1, 30))
      .max(20)
      .transform((v) => [...new Set(v)]),
    category: plain(0, 60),
    projectId: uuid.nullable(),
    paperSize: z.enum(['a4', 'letter']),
    template: z.enum(['classic', 'modern', 'minimal', 'detailed']),
    displayCurrency: z
      .enum(DISPLAY_CURRENCIES)
      .nullable()
      .refine((v) => v !== 'USD', { message: 'Choose a currency other than the dollar.' }),
    options: invoiceOptions,
    lines: z.array(invoiceLineSchema).max(MAX_LINES),
  })
  .strict()
  .refine((v) => v.dueDate >= v.issueDate, {
    message: 'The due date cannot be before the issue date.',
    path: ['dueDate'],
  });
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export const invoiceUpdateSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    /** True for the automatic save every 30 seconds: it does not add a revision. */
    autosave: z.boolean(),
    invoice: invoiceInputSchema,
  })
  .strict();

export const statusOverrideSchema = z
  .object({
    status: z.enum([
      'draft',
      'pending_approval',
      'sent',
      'viewed',
      'partially_paid',
      'paid',
      'overdue',
      'void',
      'disputed',
    ]),
    reason: plain(3, 300),
  })
  .strict();

export const revisionRestoreSchema = z
  .object({ expectedVersion: z.number().int().min(1), revision: z.number().int().min(1) })
  .strict();
