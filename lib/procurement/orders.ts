// path: lib/procurement/orders.ts
// Input of the purchase order screens. Safe to import in the browser.
import { z } from 'zod';
import { plain, moneyNonNegative } from '@/lib/crm/clients';
import { percentText, quantityText } from '@/lib/catalog/products';
import { receiveSchema } from '@/lib/stock/stock';

const uuid = z.string().uuid();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Enter a date.' });

export const PO_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'sent',
  'partial',
  'received',
  'cancelled',
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const poLineSchema = z
  .object({
    productId: uuid,
    variantId: uuid.nullable(),
    description: plain(0, 300),
    quantity: quantityText,
    unitCost: moneyNonNegative,
    taxRate: percentText,
  })
  .strict();

export const poInputSchema = z
  .object({
    supplierId: uuid,
    warehouseId: uuid,
    orderDate: day,
    expectedDate: day.nullable(),
    supplierReference: plain(0, 100),
    notes: plain(0, 2000),
    lines: z.array(poLineSchema).min(1).max(100),
  })
  .strict()
  .refine((v) => v.expectedDate === null || v.expectedDate >= v.orderDate, {
    message: 'The expected date cannot be before the order date.',
    path: ['expectedDate'],
  });
export type PoInput = z.infer<typeof poInputSchema>;

export const poUpdateSchema = z
  .object({ expectedVersion: z.number().int().min(1), order: poInputSchema })
  .strict();

export const poActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit') }).strict(),
  z.object({ action: z.literal('send') }).strict(),
  z.object({ action: z.literal('cancel') }).strict(),
  z
    .object({
      action: z.literal('receive'),
      lines: z
        .array(
          z
            .object({
              lineId: uuid,
              quantity: quantityText,
              batchNo: receiveSchema.shape.batchNo,
              expiresOn: receiveSchema.shape.expiresOn,
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict(),
]);
export type PoAction = z.infer<typeof poActionSchema>;

export const poListQuery = z
  .object({
    status: z.enum(PO_STATUSES).optional(),
    supplierId: uuid.optional(),
    after: z.string().max(300).optional(),
  })
  .strict();
export type PoListQuery = z.infer<typeof poListQuery>;
