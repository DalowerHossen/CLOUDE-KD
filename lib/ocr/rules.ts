// path: lib/ocr/rules.ts
// Inputs of the OCR settings and of a manual correction, and the view of a confidence. Pure functions, no database.
import { z } from 'zod';
import { OCR_LOW_CONFIDENCE } from '@/config/s16-ocr';

export const settingsInput = z
  .object({
    enabled: z.boolean(),
    /** A new key; leave it out to keep the saved one. */
    apiKey: z
      .string()
      .trim()
      .min(20)
      .max(120)
      .regex(/^[A-Za-z0-9_-]+$/, 'An API key has letters, digits, dashes and underscores only.')
      .optional(),
    dateOrder: z.enum(['dmy', 'mdy']),
    languageHints: z
      .array(
        z
          .string()
          .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, 'Use a language code such as en or bn.'),
      )
      .max(5)
      .default([]),
    dailyLimit: z.number().int().min(1).max(5000),
    /** The owner agrees that receipt images are sent to Google Cloud Vision. Needed to switch OCR on. */
    consent: z.boolean().default(false),
  })
  .strict();

const plainVendor = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const dayText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-03-31.')
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, {
    message: 'That date does not exist.',
  });
const amount = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 12.50.');

/** A correction: each field is a new value, or null to remove what was read. */
export const correctionInput = z
  .object({
    vendor: plainVendor.nullable().optional(),
    date: dayText.nullable().optional(),
    total: amount.nullable().optional(),
    tax: amount.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Change at least one field.',
  });

export const lowConfidence = (c: number | undefined): boolean =>
  c !== undefined && c < OCR_LOW_CONFIDENCE;
