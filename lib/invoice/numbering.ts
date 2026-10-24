// path: lib/invoice/numbering.ts
// Numbering rules that do not need the database. Safe to import in the browser.
import { z } from 'zod';
import type { InvoiceKind } from './input';

/** The series (counter) each kind of document uses. */
export const SERIES: Record<InvoiceKind, 'INV' | 'PI' | 'DEP' | 'DN'> = {
  invoice: 'INV',
  proforma: 'PI',
  deposit: 'DEP',
  debit_note: 'DN',
};

/** Prefixes that the company settings do not hold. */
export const FIXED_PREFIX: Record<Exclude<InvoiceKind, 'invoice'>, string> = {
  proforma: 'PI-',
  deposit: 'DEP-',
  debit_note: 'DN-',
};

/** A number typed by hand: letters, digits and . _ / - only, 1 to 40 characters. */
export const manualNumberSchema = z
  .object({
    number: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/, {
        message: 'Use letters, digits and . _ / - only (40 at most).',
      }),
  })
  .strict();

/** How a number looks: prefix, then the year for a yearly series, then the counter with leading zeros. */
export function formatNumber(
  prefix: string,
  yearly: boolean,
  year: number,
  counter: number,
  padding: number,
): string {
  return `${prefix}${yearly ? `${year}-` : ''}${String(counter).padStart(padding, '0')}`;
}
