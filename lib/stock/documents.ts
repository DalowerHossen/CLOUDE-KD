// path: lib/stock/documents.ts
// Input of inventory documents and stock counts. Safe to import in the browser.
import { z } from 'zod';
import { plain } from '@/lib/crm/clients';
import { countText, receiveSchema } from './stock';
import { quantityText } from '@/lib/catalog/products';

const uuid = z.string().uuid();

export const DOCUMENT_KINDS = [
  'receipt',
  'issue',
  'sales_return',
  'purchase_return',
  'packing_slip',
  'delivery_note',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
/** Number prefix of each kind, for example GRN-2026-0001. */
export const DOCUMENT_PREFIX: Readonly<Record<DocumentKind, string>> = {
  receipt: 'GRN',
  issue: 'ISS',
  sales_return: 'SR',
  purchase_return: 'PR',
  packing_slip: 'PS',
  delivery_note: 'DN',
};
/** Kinds that move stock when posted. */
export const MOVES_STOCK: readonly DocumentKind[] = [
  'receipt',
  'issue',
  'sales_return',
  'purchase_return',
];

export function formatNumber(prefix: string, year: number, n: number): string {
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
}

export const documentLineSchema = z
  .object({
    productId: uuid,
    variantId: uuid.nullable(),
    quantity: quantityText,
    unitCost: receiveSchema.shape.unitCost,
    batchNo: receiveSchema.shape.batchNo,
    expiresOn: receiveSchema.shape.expiresOn,
    note: plain(0, 300),
  })
  .strict();

export const documentInputSchema = z
  .object({
    kind: z.enum(DOCUMENT_KINDS),
    warehouseId: uuid,
    partyType: z.enum(['none', 'client', 'supplier']),
    partyId: uuid.nullable(),
    partyName: plain(0, 200),
    reference: plain(0, 100),
    note: plain(0, 1000),
    lines: z.array(documentLineSchema).min(1).max(100),
  })
  .strict()
  .refine((v) => v.partyType !== 'none' || v.partyId === null, {
    message: 'No party, no party id.',
    path: ['partyId'],
  });
export type DocumentInput = z.infer<typeof documentInputSchema>;

export const documentUpdateSchema = z
  .object({ expectedVersion: z.number().int().min(1), document: documentInputSchema })
  .strict();

export const documentActionSchema = z.object({ action: z.enum(['post', 'cancel']) }).strict();

export const documentListQuery = z
  .object({
    kind: z.enum(DOCUMENT_KINDS).optional(),
    status: z.enum(['draft', 'posted', 'cancelled']).optional(),
    after: z.string().max(300).optional(),
  })
  .strict();

export const countStartSchema = z.object({ warehouseId: uuid, note: plain(0, 500) }).strict();
export const countSaveSchema = z
  .object({
    counts: z
      .array(z.object({ lineId: uuid, countedQty: countText.nullable() }).strict())
      .min(1)
      .max(1000),
  })
  .strict();
export const countActionSchema = z.object({ action: z.enum(['complete', 'cancel']) }).strict();

export const barcodeQuery = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[0-9A-Za-z._/-]+$/, { message: 'A code uses letters, digits and . _ / - only.' }),
  })
  .strict();
