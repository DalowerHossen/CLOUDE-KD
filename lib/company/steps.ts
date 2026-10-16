// path: lib/company/steps.ts
// Input shapes of the onboarding wizard (one per step). Safe to import in the browser.
import { z } from 'zod';
import { DUE_DAYS, FONT_KEYS, INDUSTRIES } from './sections';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const plain = (max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const stepSchema = z.union([
  z
    .object({
      step: z.literal(1),
      legalName: plain(200).refine((v) => v.length >= 1, { message: 'Enter the company name.' }),
      tradingName: plain(200).default(''),
      industry: z.enum(INDUSTRIES),
      phone: z
        .string()
        .trim()
        .regex(/^[0-9+()\-. ]{5,30}$/)
        .or(z.literal(''))
        .default(''),
      addressLine1: plain(200).default(''),
      city: plain(100).default(''),
      region: plain(100).default(''),
      postalCode: plain(20).default(''),
      country: z.string().regex(/^[A-Z]{2}$/),
      timezone: z.string().min(1).max(64),
    })
    .strict(),
  z.object({ step: z.literal(2) }).strict(),
  z
    .object({ step: z.literal(3), primaryColor: hex, accentColor: hex, fontKey: z.enum(FONT_KEYS) })
    .strict(),
  z
    .object({
      step: z.literal(4),
      invoicePrefix: z.string().regex(/^[A-Z0-9-]{0,10}$/),
      numbering: z.enum(['sequential', 'yearly']),
      dueDays: z
        .number()
        .int()
        .refine((n) => (DUE_DAYS as readonly number[]).includes(n)),
      terms: plain(2000).default(''),
      notes: plain(2000).default(''),
      usePreset: z.boolean().default(false),
    })
    .strict(),
  z.object({ step: z.literal(5), paymentsSkipped: z.boolean() }).strict(),
  z.object({ action: z.literal('skip') }).strict(),
  z.object({ action: z.literal('resume') }).strict(),
]);
export type StepInput = z.infer<typeof stepSchema>;
