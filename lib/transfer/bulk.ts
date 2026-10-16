// path: lib/transfer/bulk.ts
// Input of the bulk actions on products and suppliers. Safe to import in the browser.
import { z } from 'zod';

const ids = z
  .array(z.string().uuid())
  .min(1)
  .max(200)
  .transform((v) => [...new Set(v)]);

export const productBulkSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('archive'), ids }).strict(),
  z.object({ action: z.literal('activate'), ids }).strict(),
  z.object({ action: z.literal('deactivate'), ids }).strict(),
  z.object({ action: z.literal('delete'), ids }).strict(),
]);
export type ProductBulk = z.infer<typeof productBulkSchema>;

export const supplierBulkSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('archive'), ids }).strict(),
  z.object({ action: z.literal('reactivate'), ids }).strict(),
  z.object({ action: z.literal('delete'), ids }).strict(),
]);
export type SupplierBulk = z.infer<typeof supplierBulkSchema>;
