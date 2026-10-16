// path: lib/procurement/bills.ts
// Input of the supplier bill and remittance screens. Safe to import in the browser.
import { z } from 'zod';
import { plain, moneyNonNegative } from '@/lib/crm/clients';
import { percentText, quantityText } from '@/lib/catalog/products';
import { Money } from '@/lib/utils/currency';

const uuid = z.string().uuid();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Enter a date.' });

/** A money amount above zero with at most four decimal places. */
export const moneyPositive = z
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
    { message: 'Enter an amount above zero with at most four decimal places.' },
  );

export const BILL_STATUSES = ['draft', 'open', 'partial', 'paid', 'void'] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];
export const MATCH_STATUSES = ['unmatched', 'matched', 'mismatch', 'overridden'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export const REMITTANCE_METHODS = ['bank_transfer', 'cash', 'card', 'cheque', 'other'] as const;
export type RemittanceMethod = (typeof REMITTANCE_METHODS)[number];

export const billLineSchema = z
  .object({
    poLineId: uuid.nullable(),
    productId: uuid.nullable(),
    description: plain(0, 300),
    quantity: quantityText,
    unitCost: moneyNonNegative,
    taxRate: percentText,
  })
  .strict()
  .refine((v) => v.productId !== null || v.description.length > 0, {
    message: 'A line needs an item or a description.',
    path: ['description'],
  });

export const billInputSchema = z
  .object({
    supplierId: uuid,
    purchaseOrderId: uuid.nullable(),
    supplierInvoiceNo: plain(0, 60),
    billDate: day,
    dueDate: day,
    notes: plain(0, 2000),
    lines: z.array(billLineSchema).min(1).max(100),
  })
  .strict()
  .refine((v) => v.dueDate >= v.billDate, {
    message: 'The due date cannot be before the bill date.',
    path: ['dueDate'],
  });
export type BillInput = z.infer<typeof billInputSchema>;

export const billUpdateSchema = z
  .object({ expectedVersion: z.number().int().min(1), bill: billInputSchema })
  .strict();

export const billActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('post'), override: z.boolean() }).strict(),
  z.object({ action: z.literal('void') }).strict(),
]);
export type BillAction = z.infer<typeof billActionSchema>;

export const billListQuery = z
  .object({
    status: z.enum(BILL_STATUSES).optional(),
    supplierId: uuid.optional(),
    after: z.string().max(300).optional(),
  })
  .strict();
export type BillListQuery = z.infer<typeof billListQuery>;

export const remittanceInputSchema = z
  .object({
    supplierId: uuid,
    amount: moneyPositive,
    paidOn: day,
    method: z.enum(REMITTANCE_METHODS),
    reference: plain(0, 100),
    allocations: z
      .array(z.object({ billId: uuid, amount: moneyPositive }).strict())
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (v) => {
      try {
        return Money.sum(v.allocations.map((a) => Money.parse(a.amount))).eq(v.amount);
      } catch {
        return false;
      }
    },
    { message: 'The amounts given to the bills must add up to the amount paid.', path: ['amount'] },
  )
  .refine((v) => new Set(v.allocations.map((a) => a.billId)).size === v.allocations.length, {
    message: 'A bill can appear only once.',
    path: ['allocations'],
  });
export type RemittanceInput = z.infer<typeof remittanceInputSchema>;

export const agingQuery = z.object({ asOf: day.optional() }).strict();
export const supplierStatementQuery = z
  .object({ from: day, to: day })
  .strict()
  .refine((v) => v.from <= v.to, { message: 'The start must not be after the end.' });
