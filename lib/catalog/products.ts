// path: lib/catalog/products.ts
// Input shapes of the catalog. Safe to import in the browser. Money and quantities are decimal text with at most four
// places; a tax rate is a percentage with at most four places.
import { z } from 'zod';
import { customValuesSchema, moneyNonNegative, plain } from '@/lib/crm/clients';
import { Money } from '@/lib/utils/currency';

export const UNIT_SUGGESTIONS = [
  'unit',
  'hour',
  'day',
  'month',
  'piece',
  'box',
  'kg',
  'g',
  'lb',
  'm',
  'km',
  'mile',
  'liter',
] as const;
export const TAX_CATEGORIES = ['standard', 'reduced', 'zero', 'exempt'] as const;
export const PRODUCT_STATUSES = ['active', 'inactive', 'archived'] as const;
export const MAX_IMAGES = 5;

const uuid = z.string().uuid();

/** A positive decimal such as "2.5" with at most four places (a quantity). */
export const quantityText = z
  .string()
  .trim()
  .refine(
    (v) => {
      try {
        return Money.parse(v).isPositive();
      } catch {
        return false;
      }
    },
    { message: 'Enter a quantity above zero with at most four decimal places.' },
  );

/** A percentage from 0 to 100 with at most four places. */
export const percentText = z
  .string()
  .trim()
  .refine(
    (v) => {
      try {
        const m = Money.parse(v);
        return !m.isNegative() && m.lte('100');
      } catch {
        return false;
      }
    },
    { message: 'Enter a percentage from 0 to 100.' },
  );

const code = (label: string): z.ZodType<string | null, string> =>
  z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === '' || /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,39}$/.test(v), {
      message: `${label} may use letters, digits and . _ - / only.`,
    })
    .transform((v) => (v === '' ? null : v));

const barcode = z
  .string()
  .trim()
  .max(32)
  .refine((v) => v === '' || /^[0-9A-Za-z-]{4,32}$/.test(v), {
    message: 'A barcode has 4 to 32 letters, digits or dashes.',
  })
  .transform((v) => (v === '' ? null : v));

export const volumeTierSchema = z
  .object({ minQty: quantityText, unitPrice: moneyNonNegative })
  .strict();

export const bundleItemSchema = z.object({ productId: uuid, quantity: quantityText }).strict();

export const productInputSchema = z
  .object({
    kind: z.enum(['product', 'service', 'bundle']),
    name: plain(1, 200),
    description: plain(0, 2000),
    sku: code('The SKU'),
    barcode,
    unit: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9 ./-]{0,19}$/, { message: 'Use a short unit such as hour or kg.' }),
    unitPrice: moneyNonNegative,
    costPrice: moneyNonNegative,
    taxCategory: z.enum(TAX_CATEGORIES),
    taxRate: percentText,
    categoryId: uuid.nullable(),
    hsCode: z
      .string()
      .trim()
      .max(20)
      .regex(/^[0-9A-Za-z.-]*$/, { message: 'Use letters, digits . and - only.' }),
    trackInventory: z.boolean(),
    valuationMethod: z.enum(['average', 'fifo', 'lifo']),
    status: z.enum(PRODUCT_STATUSES),
    customFields: customValuesSchema,
    volumeTiers: z.array(volumeTierSchema).max(10),
    bundleItems: z.array(bundleItemSchema).max(30),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.trackInventory && v.kind !== 'product')
      ctx.addIssue({
        code: 'custom',
        path: ['trackInventory'],
        message: 'Only physical products have stock.',
      });
    if (v.kind === 'bundle' && v.bundleItems.length === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['bundleItems'],
        message: 'A bundle needs at least one item.',
      });
    if (v.kind !== 'bundle' && v.bundleItems.length > 0)
      ctx.addIssue({ code: 'custom', path: ['bundleItems'], message: 'Only a bundle has items.' });
    if (new Set(v.bundleItems.map((i) => i.productId)).size !== v.bundleItems.length)
      ctx.addIssue({ code: 'custom', path: ['bundleItems'], message: 'Each item once.' });
    for (let i = 1; i < v.volumeTiers.length; i += 1) {
      const a = v.volumeTiers[i - 1];
      const b = v.volumeTiers[i];
      if (a && b && !Money.parse(b.minQty).gt(a.minQty))
        ctx.addIssue({
          code: 'custom',
          path: ['volumeTiers'],
          message: 'Tiers must start at higher quantities one after the other.',
        });
    }
  });
export type ProductInput = z.infer<typeof productInputSchema>;

/** Creating a product first checks for look-alikes; `confirmDuplicate: true` creates it anyway. */
export const productCreateSchema = z
  .object({ product: productInputSchema, confirmDuplicate: z.boolean() })
  .strict();

/** The update carries the loaded version. (A refined object cannot be extended, so the check repeats on the base.) */
export const productUpdateSchema = z
  .object({ expectedVersion: z.number().int().min(1), product: productInputSchema })
  .strict();
export type ProductUpdate = z.infer<typeof productUpdateSchema>;

export const variantSchema = z
  .object({
    id: uuid.nullable(),
    name: plain(1, 120),
    sku: code('The SKU'),
    barcode,
    unitPrice: moneyNonNegative.nullable(),
    attributes: z
      .record(z.string().regex(/^[a-z][a-z0-9_]{0,30}$/), plain(0, 60))
      .refine((v) => Object.keys(v).length <= 10, { message: 'Ten attributes at most.' }),
    isActive: z.boolean(),
  })
  .strict();
export const variantsSaveSchema = z.object({ variants: z.array(variantSchema).max(50) }).strict();

export const categorySaveSchema = z
  .object({ id: uuid.nullable(), name: plain(1, 80), position: z.number().int().min(0).max(1000) })
  .strict();
export const categoryDeleteSchema = z.object({ id: uuid }).strict();

export const clientRateSchema = z
  .object({ clientId: uuid, productId: uuid, unitPrice: moneyNonNegative.nullable() })
  .strict();

export const productListQuery = z
  .object({
    q: z.string().trim().max(80).optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    kind: z.enum(['product', 'service', 'bundle']).optional(),
    category: uuid.optional(),
    min: z.string().trim().max(20).optional(),
    max: z.string().trim().max(20).optional(),
    sort: z.enum(['name', 'created', 'price']).default('name'),
    desc: z.enum(['0', '1']).default('0'),
    after: z.string().max(300).optional(),
  })
  .strict();
export type ProductListQuery = z.infer<typeof productListQuery>;

export const pickerQuery = z
  .object({
    q: z.string().trim().max(80).default(''),
    clientId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  })
  .strict();

export const productDuplicateQuery = z
  .object({
    name: z.string().trim().min(1).max(200),
    sku: z.string().trim().max(40).optional(),
    barcode: z.string().trim().max(32).optional(),
    exclude: uuid.optional(),
  })
  .strict();

export const inlineProductSchema = z
  .object({
    name: plain(1, 200),
    unitPrice: moneyNonNegative,
    unit: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9 ./-]{0,19}$/),
    kind: z.enum(['product', 'service']),
  })
  .strict();
