// path: lib/integrations/public-schemas.ts
// The shapes of the public API v1: what each resource looks like in an answer, the filters of each list, the bodies of the
// sandbox writes, and the cursor. The OpenAPI document is built from these same schemas, so the document and the routes
// cannot disagree. Money is always text with up to four decimals; the currency is always USD.
import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/config/s16-api';
import { base64UrlDecode, base64UrlEncode } from '@/lib/utils/hash';

const text = (max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const name = (max: number): z.ZodEffects<ReturnType<typeof text>, string, string> =>
  text(max).refine((v) => v.length > 0, { message: 'A value is needed.' });
const money = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Use an amount like 12.5000.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-01-31.');
const stamp = z.string();
const uuid = z.string().uuid();
const email = z.string().trim().toLowerCase().email().max(254);
const country = z.string().regex(/^[A-Z]{2}$/, 'Use a two letter country code like US.');

/* ---------- answers ---------- */

export const addressOut = z.object({
  line1: z.string(),
  line2: z.string(),
  city: z.string(),
  region: z.string(),
  postal_code: z.string(),
  country: z.string().nullable(),
});

export const clientOut = z.object({
  id: uuid,
  kind: z.enum(['company', 'person']),
  name: z.string(),
  contact_name: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  website: z.string(),
  tax_id: z.string(),
  currency: z.string(),
  payment_terms_days: z.number().int().nullable(),
  tags: z.array(z.string()),
  status: z.enum(['active', 'archived']),
  billing_address: addressOut,
  created_at: stamp,
  updated_at: stamp,
  version: z.number().int(),
});

export const productOut = z.object({
  id: uuid,
  kind: z.enum(['product', 'service', 'bundle']),
  name: z.string(),
  description: z.string(),
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  unit: z.string(),
  unit_price: money,
  tax_category: z.enum(['standard', 'reduced', 'zero', 'exempt']),
  tax_rate: z.string(),
  status: z.enum(['active', 'inactive', 'archived']),
  created_at: stamp,
  updated_at: stamp,
  version: z.number().int(),
});

export const invoiceItemOut = z.object({
  position: z.number().int(),
  sku: z.string(),
  description: z.string(),
  quantity: money,
  unit: z.string(),
  unit_price: money,
  tax: money,
  line_total: money,
});

export const invoiceOut = z.object({
  id: uuid,
  number: z.string().nullable(),
  kind: z.string(),
  status: z.string(),
  client_id: uuid.nullable(),
  issue_date: day,
  due_date: day,
  currency: z.literal('USD'),
  subtotal: money,
  tax_total: money,
  total: money,
  amount_paid: money,
  amount_due: money,
  sent_at: stamp.nullable(),
  paid_at: stamp.nullable(),
  items: z.array(invoiceItemOut).optional(),
  created_at: stamp,
  updated_at: stamp,
  version: z.number().int(),
});

export const estimateOut = z.object({
  id: uuid,
  number: z.string().nullable(),
  status: z.string(),
  client_id: uuid.nullable(),
  currency: z.literal('USD'),
  subtotal: money,
  tax_total: money,
  total: money,
  valid_until: day.nullable(),
  sent_at: stamp.nullable(),
  created_at: stamp,
  updated_at: stamp,
  version: z.number().int(),
});

export const paymentOut = z.object({
  id: uuid,
  invoice_id: uuid,
  client_id: uuid.nullable(),
  status: z.string(),
  amount: money,
  currency: z.literal('USD'),
  captured_amount: money,
  refunded_amount: money,
  payment_method: z.string(),
  captured_at: stamp.nullable(),
  created_at: stamp,
  updated_at: stamp,
  version: z.number().int(),
});

export const statusOut = z.object({
  status: z.enum(['operational']),
  version: z.string(),
  time: stamp,
});

export type ClientOut = z.infer<typeof clientOut>;
export type ProductOut = z.infer<typeof productOut>;
export type InvoiceOut = z.infer<typeof invoiceOut>;
export type EstimateOut = z.infer<typeof estimateOut>;
export type PaymentOut = z.infer<typeof paymentOut>;

/* ---------- lists ---------- */

const listBase = {
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().max(100).optional(),
  sort: z.enum(['created_desc', 'created_asc']).default('created_desc'),
  updated_since: z.string().datetime({ offset: true }).optional(),
};

export const clientsQuery = z
  .object({
    ...listBase,
    status: z.enum(['active', 'archived']).optional(),
    email: email.optional(),
  })
  .strict();
export const productsQuery = z
  .object({
    ...listBase,
    status: z.enum(['active', 'inactive', 'archived']).optional(),
    kind: z.enum(['product', 'service', 'bundle']).optional(),
    sku: z.string().trim().max(40).optional(),
  })
  .strict();
export const invoicesQuery = z
  .object({
    ...listBase,
    status: z.string().trim().max(30).optional(),
    client_id: uuid.optional(),
    issued_from: day.optional(),
    issued_to: day.optional(),
  })
  .strict();
export const estimatesQuery = z
  .object({
    ...listBase,
    status: z.string().trim().max(30).optional(),
    client_id: uuid.optional(),
  })
  .strict();
export const paymentsQuery = z
  .object({
    ...listBase,
    status: z.string().trim().max(30).optional(),
    invoice_id: uuid.optional(),
  })
  .strict();

export type ListQuery = z.infer<typeof clientsQuery> &
  z.infer<typeof productsQuery> &
  z.infer<typeof invoicesQuery> &
  z.infer<typeof estimatesQuery> &
  z.infer<typeof paymentsQuery>;

export const idParams = z.object({ id: uuid }).strict();

/* ---------- sandbox writes ---------- */

const addressIn = z
  .object({
    line1: text(200).default(''),
    line2: text(200).default(''),
    city: text(100).default(''),
    region: text(100).default(''),
    postal_code: text(20).default(''),
    country: country.nullable().default(null),
  })
  .strict();

export const clientCreate = z
  .object({
    kind: z.enum(['company', 'person']).default('company'),
    name: name(200),
    contact_name: text(200).default(''),
    email: email.nullable().default(null),
    phone: text(30).default(''),
    website: text(200).default(''),
    tax_id: text(40).default(''),
    payment_terms_days: z.number().int().min(0).max(365).nullable().default(null),
    tags: z.array(name(40)).max(20).default([]),
    billing_address: addressIn.default({}),
  })
  .strict();
export const clientUpdate = z
  .object({
    version: z.number().int().min(1),
    name: name(200).optional(),
    contact_name: text(200).optional(),
    email: email.nullable().optional(),
    phone: text(30).optional(),
    website: text(200).optional(),
    tax_id: text(40).optional(),
    status: z.enum(['active', 'archived']).optional(),
    tags: z.array(name(40)).max(20).optional(),
  })
  .strict();

export const productCreate = z
  .object({
    kind: z.enum(['product', 'service']).default('product'),
    name: name(200),
    description: text(2000).default(''),
    sku: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,39}$/, 'Use letters, digits and . _ - /')
      .nullable()
      .default(null),
    unit: z
      .string()
      .regex(/^[a-z][a-z0-9 ./-]{0,19}$/)
      .default('unit'),
    unit_price: money,
    tax_rate: z
      .string()
      .regex(/^\d{1,3}(\.\d{1,4})?$/)
      .default('0'),
  })
  .strict();
export const productUpdate = z
  .object({
    version: z.number().int().min(1),
    name: name(200).optional(),
    description: text(2000).optional(),
    unit_price: money.optional(),
    status: z.enum(['active', 'inactive', 'archived']).optional(),
  })
  .strict();

export const lineIn = z
  .object({
    description: name(500),
    quantity: z.string().regex(/^\d{1,9}(\.\d{1,4})?$/),
    unit_price: money,
    tax_rate: z
      .string()
      .regex(/^\d{1,3}(\.\d{1,4})?$/)
      .default('0'),
  })
  .strict();

export const invoiceCreate = z
  .object({
    client_id: uuid,
    issue_date: day,
    due_date: day,
    items: z.array(lineIn).min(1).max(200),
  })
  .strict();
export const estimateCreate = z
  .object({
    client_id: uuid,
    valid_until: day,
    items: z.array(lineIn).min(1).max(200),
  })
  .strict();

/* ---------- cursor ---------- */

/** An opaque cursor for the id of the last row of a page. */
export function encodeCursor(id: string): string {
  return base64UrlEncode(new TextEncoder().encode(id));
}

/** The id inside a cursor, or null when the cursor is not one this API made. */
export function decodeCursor(cursor: string): string | null {
  try {
    const id = new TextDecoder().decode(base64UrlDecode(cursor));
    return uuid.safeParse(id).success ? id : null;
  } catch {
    return null;
  }
}
