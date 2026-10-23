// path: lib/tax/input.ts
// Input of the tax screens. Safe to import in the browser.
import { z } from 'zod';
import { plain } from '@/lib/crm/clients';
import { percentText } from '@/lib/catalog/products';
import { CASH_ROUNDING_STEPS, PRECISIONS, ROUNDING_MODES } from '@/lib/invoice/rounding';
import { US_STATES } from './templates';

const country = z
  .string()
  .regex(/^[A-Z]{2}$/, { message: 'Use a two-letter country code such as US.' });

export const TAX_KINDS = ['sales', 'vat', 'gst', 'withholding', 'other'] as const;

export const taxRateInput = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_.-]{0,19}$/, { message: 'Use letters, digits . _ - (20 at most).' }),
    name: plain(1, 80),
    rate: percentText,
    kind: z.enum(TAX_KINDS),
    country: country.nullable(),
    region: plain(0, 60),
    compound: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000),
  })
  .strict();
export type TaxRateInput = z.infer<typeof taxRateInput>;

export const taxRateUpdate = z
  .object({ expectedVersion: z.number().int().min(1), rate: taxRateInput })
  .strict();

export const templateApply = z
  .object({ templateId: z.string().regex(/^[a-z]{2}-[a-z]{2,4}$/) })
  .strict();

export const taxSettingsInput = z
  .object({
    priceMode: z.enum(['exclusive', 'inclusive']),
    discountOrder: z.enum(['before_tax', 'after_tax']),
    roundingPolicy: z.enum(['per_line', 'on_total']),
    roundingMode: z.enum(ROUNDING_MODES),
    precision: z
      .union([z.literal(2), z.literal(3), z.literal(4)])
      .refine((v) => PRECISIONS.includes(v)),
    cashRounding: z.enum(CASH_ROUNDING_STEPS),
    fiscalYearStartMonth: z.number().int().min(1).max(12),
    sellerTaxLabel: plain(0, 30),
    sellerTaxId: plain(0, 40),
    sellerCountry: country.nullable(),
    reverseCharge: z.boolean(),
    marketplaceFacilitator: z.boolean(),
    nexusRegions: z
      .array(z.enum(US_STATES))
      .max(60)
      .transform((v) => [...new Set(v)]),
    defaultTaxCodes: z
      .array(z.string().regex(/^[A-Z0-9][A-Z0-9_.-]{0,19}$/))
      .max(5)
      .transform((v) => [...new Set(v)]),
    defaultWithholding: percentText,
  })
  .strict();
export type TaxSettingsInput = z.infer<typeof taxSettingsInput>;

export const taxSettingsSave = z
  .object({ expectedVersion: z.number().int().min(1).nullable(), settings: taxSettingsInput })
  .strict();

export const exemptionInput = z
  .object({
    taxExempt: z.boolean(),
    reason: plain(0, 300),
    certificateExpiresOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Enter a date.' })
      .nullable(),
    clientTaxId: plain(0, 40),
    clientTaxLabel: plain(0, 30),
  })
  .strict();
export type ExemptionInput = z.infer<typeof exemptionInput>;

export const exemptionSave = z
  .object({ expectedVersion: z.number().int().min(1).nullable(), exemption: exemptionInput })
  .strict();

export const certificateUpload = z
  .object({
    name: z.string().trim().min(1).max(150),
    mimeType: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
    /** Base64 of the file, at most about 3 MB of file data. */
    dataBase64: z
      .string()
      .min(8)
      .max(4_200_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
