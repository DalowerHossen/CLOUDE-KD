// path: lib/crm/clients.ts
// Client input shapes and small helpers. Safe to import in the browser. Text is plain text: angle brackets are
// refused, so nothing stored can ever be read as markup. Money is decimal text with at most four places.
import { z } from 'zod';
import { DISPLAY_CURRENCIES } from '@/lib/company/sections';
import { Money } from '@/lib/utils/currency';

export const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
    message: 'Enter a valid e-mail address.',
  })
  .transform((v) => (v === '' ? null : v));
const phone = z
  .string()
  .trim()
  .regex(/^[0-9+()\-. ]{0,30}$/, { message: 'Use digits and + ( ) - . only.' });
const website = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === '' || /^https:\/\/[^\s<>]+$/.test(v), {
    message: 'Use an address that starts with https://',
  });
const countryCode = z.string().regex(/^[A-Z]{2}$/, { message: 'Choose a country.' });

export const moneyText = z
  .string()
  .trim()
  .refine(
    (v) => {
      try {
        Money.parse(v);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Enter an amount with at most four decimal places.' },
  );

/** Money that cannot be negative (prices, limits). */
export const moneyNonNegative = moneyText.refine(
  (v) => {
    try {
      return !Money.parse(v).isNegative();
    } catch {
      return true; // a malformed amount is already refused by moneyText
    }
  },
  { message: 'The amount cannot be negative.' },
);

const address = z
  .object({
    line1: plain(0, 200),
    line2: plain(0, 200),
    city: plain(0, 100),
    region: plain(0, 100),
    postalCode: plain(0, 20),
    country: countryCode.nullable(),
  })
  .strict();

/** The billing postal code and country are required: payment verification compares them with the payer. */
const billingAddress = address.extend({
  postalCode: plain(1, 20),
  country: countryCode,
});

export const contactSchema = z
  .object({ name: plain(1, 200), role: plain(0, 100), email: optionalEmail, phone })
  .strict();

const tag = plain(1, 30).transform((v) => v.toLowerCase());
export const customValuesSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
    z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]),
  )
  .refine((v) => Object.keys(v).length <= 30, { message: 'Too many custom fields.' })
  .refine((v) => Object.values(v).every((x) => typeof x !== 'string' || !/[<>]/.test(x)), {
    message: 'Angle brackets are not allowed.',
  });

export const clientInputSchema = z
  .object({
    kind: z.enum(['company', 'person']),
    name: plain(1, 200),
    contactName: plain(0, 200),
    email: optionalEmail,
    billingEmail: optionalEmail,
    phone,
    website,
    taxId: plain(0, 40),
    displayCurrency: z.enum(DISPLAY_CURRENCIES),
    paymentTermsDays: z.number().int().min(0).max(365).nullable(),
    notes: plain(0, 5000),
    tags: z
      .array(tag)
      .max(20)
      .transform((v) => [...new Set(v)]),
    customFields: customValuesSchema,
    billing: billingAddress,
    shipping: address,
    openingBalance: moneyText,
    creditLimit: moneyNonNegative.nullable(),
    riskFlag: z.enum(['none', 'watch', 'high']),
    doNotContact: z.boolean(),
    remindersOptOut: z.boolean(),
    marketingConsent: z.boolean(),
    contactPreference: z.enum(['email', 'phone']),
    portalPrefs: z.object({ notifyByEmail: z.boolean(), showStatement: z.boolean() }).strict(),
    contacts: z.array(contactSchema).max(10),
  })
  .strict();
export type ClientInput = z.infer<typeof clientInputSchema>;

/** Creating a client first checks for look-alikes; sending `confirmDuplicate: true` creates it anyway. */
export const clientCreateSchema = clientInputSchema
  .extend({ confirmDuplicate: z.boolean() })
  .strict();
export type ClientCreate = z.infer<typeof clientCreateSchema>;

export const clientUpdateSchema = clientInputSchema
  .extend({ expectedVersion: z.number().int().min(1) })
  .strict();
export type ClientUpdate = z.infer<typeof clientUpdateSchema>;

/** The short form used while writing an invoice. */
export const quickClientSchema = z
  .object({
    name: plain(1, 200),
    email: optionalEmail,
    postalCode: plain(1, 20),
    country: countryCode,
    confirmDuplicate: z.boolean(),
  })
  .strict();
export type QuickClient = z.infer<typeof quickClientSchema>;

export const statusActionSchema = z.object({ action: z.enum(['archive', 'reactivate']) }).strict();

export const customFieldDefSchema = z
  .object({
    entity: z.enum(['client', 'product', 'supplier']),
    key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
    label: plain(1, 80),
    kind: z.enum(['text', 'number', 'date', 'select', 'bool']),
    options: z.array(plain(1, 60)).max(30),
    required: z.boolean(),
    position: z.number().int().min(0).max(1000),
  })
  .strict()
  .refine((d) => d.kind !== 'select' || d.options.length >= 1, {
    message: 'A choice field needs at least one option.',
    path: ['options'],
  });
export type CustomFieldDefInput = z.infer<typeof customFieldDefSchema>;

export const customFieldsSaveSchema = z
  .object({
    entity: z.enum(['client', 'product', 'supplier']),
    fields: z.array(customFieldDefSchema).max(40),
  })
  .strict()
  .refine((v) => v.fields.every((f) => f.entity === v.entity), { message: 'Mixed entities.' })
  .refine((v) => new Set(v.fields.map((f) => f.key)).size === v.fields.length, {
    message: 'Each key once.',
  });

/** Two letters for the round avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return `${first}${second}`.toUpperCase();
}

export const BLANK_ADDRESS = {
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: null,
} as const;
