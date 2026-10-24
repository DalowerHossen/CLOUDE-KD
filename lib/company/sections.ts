// path: lib/company/sections.ts
// Tenant settings sections and their strict schemas. Safe to import in the browser. Each section is stored as one
// jsonb object in company_settings; reading fills missing keys from the defaults, so adding a key later never breaks
// an older row. Text is plain text: angle brackets are refused, so nothing stored can ever be read as markup.
import { z } from 'zod';

const text = (max: number): z.ZodString =>
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

export const notificationsSchema = z
  .object({
    /** Who in the company is told about events of a category. Security and KYC notices always go to the owner. */
    recipients: z
      .object({
        invoice: z.enum(['owner', 'all']),
        payment: z.enum(['owner', 'all']),
        system: z.enum(['owner', 'all']),
      })
      .strict(),
    summary: z.enum(['off', 'daily', 'weekly']),
  })
  .strict();

/** An IPv4 or IPv6 address, or an IPv4 range such as 203.0.113.0/24. */
const ipEntry = z
  .string()
  .trim()
  .max(50)
  .refine(
    (v) =>
      (/^(\d{1,3}\.){3}\d{1,3}(\/(\d|[12]\d|3[0-2]))?$/.test(v) &&
        v
          .split('/')[0]!
          .split('.')
          .every((n) => Number(n) <= 255)) ||
      /^[0-9a-fA-F:]{2,45}(\/\d{1,3})?$/.test(v),
    { message: 'Use an IP address or a range such as 203.0.113.0/24.' },
  );

export const securitySchema = z
  .object({
    /** Staff must have two-factor sign-in. Applied by the sign-in flow of STEP 03. */
    requireTwoFactor: z.boolean(),
    /** Idle minutes before a staff session ends; null uses the platform default. */
    staffSessionTimeoutMinutes: z.number().int().min(15).max(1440).nullable(),
    /** Staff may sign in only from these addresses; empty means no restriction. The owner is never restricted. */
    ipAllowlist: z.array(ipEntry).max(20),
  })
  .strict();

export const approvalSchema = z
  .object({
    /** Actions a staff member can only prepare; the owner approves them before they take effect. */
    ownerApprovalActions: z
      .array(z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/))
      .max(30),
    /** Largest amount (US dollars, decimal text) a staff member may approve alone; null means no cap. */
    staffAmountCap: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,4})?$/)
      .nullable(),
  })
  .strict();

export const policySchema = z
  .object({
    /** Shortest password accepted for people of this company. The platform minimum still applies. */
    minPasswordLength: z.number().int().min(10).max(64),
    requireComplexity: z.boolean(),
    /** Tell the owner by e-mail when someone signs in from a new device. */
    loginNotifications: z.boolean(),
    /** A data export asked for by staff waits for the owner to approve it. */
    exportNeedsOwnerApproval: z.boolean(),
  })
  .strict();

export const backupSchema = z
  .object({
    schedule: z.enum(['off', 'daily', 'weekly']),
    /** Time the last scheduled backup was started. */
    lastScheduledAt: z.string().datetime().nullable(),
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

const emailDomain = z
  .string()
  .trim()
  .toLowerCase()
  .max(100)
  .regex(/^(?=.{4,100}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/, {
    message: 'Use a domain such as example.com.',
  });

/** Single sign-on settings. Saving them only prepares the setup; the platform turns it on after a check. */
export const ssoSchema = z
  .object({
    protocol: z.enum(['none', 'saml', 'oidc']),
    providerName: text(80),
    /** OIDC issuer address or SAML identity provider entity address. */
    issuerUrl: optionalUrl,
    /** SAML single sign-on address or OIDC sign-in address. */
    loginUrl: optionalUrl,
    /** OIDC client id or SAML service entity id. */
    clientId: text(200),
    emailDomains: z
      .array(emailDomain)
      .max(5)
      .refine((v) => new Set(v).size === v.length, { message: 'Each domain once.' }),
    enforceForStaff: z.boolean(),
  })
  .strict();

export const SECTION_SCHEMAS = {
  profile: profileSchema,
  branding: brandingSchema,
  invoice: invoiceSchema,
  display: displaySchema,
  notifications: notificationsSchema,
  security: securitySchema,
  approval: approvalSchema,
  policy: policySchema,
  backup: backupSchema,
  onboarding: onboardingSchema,
  sso: ssoSchema,
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
  notifications: { recipients: { invoice: 'all', payment: 'all', system: 'all' }, summary: 'off' },
  security: { requireTwoFactor: false, staffSessionTimeoutMinutes: null, ipAllowlist: [] },
  approval: { ownerApprovalActions: [], staffAmountCap: null },
  policy: {
    minPasswordLength: 12,
    requireComplexity: true,
    loginNotifications: true,
    exportNeedsOwnerApproval: true,
  },
  backup: { schedule: 'off', lastScheduledAt: null },
  sso: {
    protocol: 'none',
    providerName: '',
    issuerUrl: '',
    loginUrl: '',
    clientId: '',
    emailDomains: [],
    enforceForStaff: false,
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
