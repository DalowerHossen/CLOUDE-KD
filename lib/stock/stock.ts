// path: lib/stock/stock.ts
// Input shapes of the stock screens. Safe to import in the browser. Quantities are decimal text with at most four places.
import { z } from 'zod';
import { plain } from '@/lib/crm/clients';
import { quantityText } from '@/lib/catalog/products';
import { Money } from '@/lib/utils/currency';

const uuid = z.string().uuid();

/** Zero or more, at most four places (a quantity to count). */
export const countText = z
  .string()
  .trim()
  .refine(
    (v) => {
      try {
        return !Money.parse(v).isNegative();
      } catch {
        return false;
      }
    },
    { message: 'Enter a quantity of zero or more with at most four decimal places.' },
  );

/** A signed quantity that is not zero, for example "-3" or "2.5". */
export const changeText = z
  .string()
  .trim()
  .refine(
    (v) => {
      try {
        return !Money.parse(v).isZero();
      } catch {
        return false;
      }
    },
    { message: 'Enter a change that is not zero, with at most four decimal places.' },
  );

export const ADJUST_REASONS = ['damage', 'loss', 'return', 'correction', 'found', 'other'] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];

export const adjustSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('set'),
      productId: uuid,
      variantId: uuid.nullable(),
      warehouseId: uuid,
      quantity: countText,
      reason: z.enum(ADJUST_REASONS),
      note: plain(0, 500),
    })
    .strict(),
  z
    .object({
      mode: z.literal('change'),
      productId: uuid,
      variantId: uuid.nullable(),
      warehouseId: uuid,
      quantity: changeText,
      reason: z.enum(ADJUST_REASONS),
      note: plain(0, 500),
    })
    .strict(),
]);
export type AdjustInput = z.infer<typeof adjustSchema>;

export const transferSchema = z
  .object({
    productId: uuid,
    variantId: uuid.nullable(),
    fromWarehouseId: uuid,
    toWarehouseId: uuid,
    quantity: quantityText,
    note: plain(0, 500),
  })
  .strict()
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    message: 'Choose two different warehouses.',
    path: ['toWarehouseId'],
  });
export type TransferInput = z.infer<typeof transferSchema>;

export const warehouseSchema = z
  .object({
    id: uuid.nullable(),
    expectedVersion: z.number().int().min(1).nullable(),
    name: plain(1, 100),
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/, {
        message: 'Use letters, digits . _ - (20 at most).',
      }),
    addressLine1: plain(0, 200),
    addressCity: plain(0, 100),
    addressRegion: plain(0, 100),
    addressPostalCode: plain(0, 20),
    addressCountry: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    isActive: z.boolean(),
  })
  .strict();
export type WarehouseInput = z.infer<typeof warehouseSchema>;

export const warehouseActionSchema = z
  .object({ action: z.enum(['make_default', 'delete']), id: uuid })
  .strict();

export const levelsQuery = z
  .object({
    warehouseId: uuid.optional(),
    productId: uuid.optional(),
    low: z.enum(['1']).optional(),
    q: z.string().trim().max(80).optional(),
  })
  .strict();
export type LevelsQuery = z.infer<typeof levelsQuery>;

export const movementsQuery = z
  .object({
    productId: uuid.optional(),
    warehouseId: uuid.optional(),
    kind: z
      .enum([
        'receipt',
        'issue',
        'sale',
        'adjustment',
        'transfer_out',
        'transfer_in',
        'return_in',
        'return_out',
        'count',
      ])
      .optional(),
    after: z.string().max(300).optional(),
  })
  .strict();
export type MovementsQuery = z.infer<typeof movementsQuery>;

export const reorderSchema = z
  .object({ productId: uuid, reorderLevel: countText.nullable() })
  .strict();

export const LEDGER_PAGE = 50;
