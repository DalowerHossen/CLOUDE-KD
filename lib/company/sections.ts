// path: lib/company/sections.ts
// Tenant settings sections and their strict schemas. Safe to import in the browser. Each section is stored as one
// jsonb object in company_settings; reading fills missing keys from the defaults, so adding a key later never breaks
// an older row. Text is plain text: angle brackets are refused, so nothing stored can ever be read as markup.
import { z } from 'zod';

const text = (max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

const optionalEmail = z.string().trim().toLowerCase().email().max(254).or(z.literal(''));
const optionalPhone = z
  .string()
  .trim()
  .regex(/^[0-9+()\-. ]{5,30}$/)
  .or(z.literal(''));
const optionalUrl = z.string().trim().url().startsWith('https://').max(200).or(z.literal(''));
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const INDUSTRIES = [
  'service',
  'retail',
  'medical',
  'freelance',
  'agency',
  'ecommerce',
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const FONT_KEYS = ['system', 'inter', 'serif', 'mono'] as const;
export const DUE_DAYS = [0, 7, 14, 15, 30, 45, 60, 90] as const;

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const profileSchema = z
  .object({
    legalName: text(200),
    tradingName: text(200),
    industry: z.enum(INDUSTRIES).nullable(),
    taxId: text(40),
    registrationNumber: text(40),
    email: optionalEmail,
    phone: optionalPhone,
    website: optionalUrl,
    addressLine1: text(200),
    addressLine2: text(200),
    city: text(100),
    region: text(100),
    postalCode: text(20),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .or(z.literal('')),
    timezone: z.string().max(64).refine(validTimezone, { message: 'Unknown time zone.' }),
    contacts: z
      .array(
        z
          .object({ name: text(100), role: text(80), email: optionalEmail, phone: optionalPhone })
          .strict(),
      )
      .max(5),
  })
  .strict();

export const brandingSchema = z
  .object({
    primaryColor: hexColor,
    accentColor: hexColor,
    fontKey: z.enum(FONT_KEYS),
    logoFileId: z.string().uuid().nullable(),
  })
  .strict();

export const invoiceSchema = z
  .object({
    invoicePrefix: z.string().regex(/^[A-Z0-9-]{0,10}$/),
    estimatePrefix: z.string().regex(/^[A-Z0-9-]{0,10}$/),
    creditNotePrefix: z.string().regex(/^[A-Z0-9-]{0,10}$/),
    numbering: z.enum(['sequential', 'yearly']),
    padding: z.number().int().min(3).max(8),
    nextNumber: z.number().int().min(1).max(99_999_999),
    dueDays: z
      .number()
      .int()
      .refine((n) => (DUE_DAYS as readonly number[]).includes(n), {
        message: 'Choose a listed term.',
      }),
    terms: text(2000),
    notes: text(2000),
    footer: text(500),
  })
  .strict();

export const DISPLAY_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'AUD',
  'CAD',
  'SGD',
  'JPY',
  'INR',
  'MYR',
  'THB',
  'IDR',
  'PHP',
  'VND',
  'AED',
] as const;
export const displaySchema = z
  .object({
    /** All money is stored and billed in US dollars; these currencies are only shown next to the dollar amount. */
    displayCurrencies: z
      .array(z.enum(DISPLAY_CURRENCIES))
      .max(5)
      .refine((v) => new Set(v).size === v.length, { message: 'Each currency once.' }),
    dateFormat: z.enum(['yyyy-mm-dd', 'dd/mm/yyyy', 'mm/dd/yyyy']),
    numberFormat: z.enum(['1,234.56', '1.234,56', '1 234,56']),
    weekStart: z.enum(['monday', 'sunday']),
  })
  .strict();

export const onboardingSchema = z
  .object({
    status: z.enum(['not_started', 'in_progress', 'completed', 'skipped']),
    step: z.number().int().min(1).max(5),
    startedAt: z.string().datetime().nullable(),
    finishedAt: z.string().datetime().nullable(),
    paymentsSkipped: z.boolean(),
  })
  .strict();

export const SECTION_SCHEMAS = {
  profile: profileSchema,
  branding: brandingSchema,
  invoice: invoiceSchema,
  display: displaySchema,
  onboarding: onboardingSchema,
} as const;
export type SectionKey = keyof typeof SECTION_SCHEMAS;
export const SECTION_KEYS = Object.keys(SECTION_SCHEMAS) as SectionKey[];
export type SectionValue<K extends SectionKey> = z.infer<(typeof SECTION_SCHEMAS)[K]>;

export const SECTION_DEFAULTS: { [K in SectionKey]: SectionValue<K> } = {
  profile: {
    legalName: '',
    tradingName: '',
    industry: null,
    taxId: '',
    registrationNumber: '',
    email: '',
    phone: '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
    timezone: 'UTC',
    contacts: [],
  },
  branding: {
    primaryColor: '#1d4ed8',
    accentColor: '#0f766e',
    fontKey: 'system',
    logoFileId: null,
  },
  invoice: {
    invoicePrefix: 'INV-',
    estimatePrefix: 'EST-',
    creditNotePrefix: 'CN-',
    numbering: 'sequential',
    padding: 4,
    nextNumber: 1,
    dueDays: 30,
    terms: '',
    notes: '',
    footer: '',
  },
  display: {
    displayCurrencies: ['USD'],
    dateFormat: 'yyyy-mm-dd',
    numberFormat: '1,234.56',
    weekStart: 'monday',
  },
  onboarding: {
    status: 'not_started',
    step: 1,
    startedAt: null,
    finishedAt: null,
    paymentsSkipped: false,
  },
};

/** Example of the next invoice number for the settings screens, for example "INV-0001". */
export function previewNumber(
  s: SectionValue<'invoice'>,
  year: number = new Date().getUTCFullYear(),
): string {
  const digits = String(s.nextNumber).padStart(s.padding, '0');
  return s.numbering === 'yearly'
    ? `${s.invoicePrefix}${year}-${digits}`
    : `${s.invoicePrefix}${digits}`;
}
