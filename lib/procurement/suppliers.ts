// path: lib/procurement/suppliers.ts
// Input of the supplier screens. Safe to import in the browser.
import { z } from 'zod';
import { customValuesSchema, plain } from '@/lib/crm/clients';

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
    message: 'Enter a valid e-mail address.',
  })
  .transform((v) => (v === '' ? null : v));

export const supplierInputSchema = z
  .object({
    name: plain(1, 200),
    contactName: plain(0, 200),
    email: optionalEmail,
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+()\-. ]{0,30}$/, { message: 'Use digits and + ( ) - . only.' }),
    website: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v === '' || /^https:\/\/[^\s<>]+$/.test(v), {
        message: 'Use an address that starts with https://',
      }),
    taxId: plain(0, 40),
    category: plain(0, 60),
    paymentTermsDays: z.number().int().min(0).max(365).nullable(),
    addressLine1: plain(0, 200),
    addressLine2: plain(0, 200),
    addressCity: plain(0, 100),
    addressRegion: plain(0, 100),
    addressPostalCode: plain(0, 20),
    addressCountry: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    notes: plain(0, 3000),
    customFields: customValuesSchema,
  })
  .strict();
export type SupplierInput = z.infer<typeof supplierInputSchema>;

export const supplierUpdateSchema = z
  .object({ expectedVersion: z.number().int().min(1), supplier: supplierInputSchema })
  .strict();

export const supplierListQuery = z
  .object({
    q: z.string().trim().max(80).optional(),
    status: z.enum(['active', 'archived']).optional(),
    category: z.string().trim().max(60).optional(),
    after: z.string().max(300).optional(),
  })
  .strict();
export type SupplierListQuery = z.infer<typeof supplierListQuery>;

export const supplierStatusSchema = z
  .object({ action: z.enum(['archive', 'reactivate']) })
  .strict();
