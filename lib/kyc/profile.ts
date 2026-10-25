// path: lib/kyc/profile.ts
// The KYC profile: how a company is verified and what the form asks. The platform team chooses these in Admin > Verification
// settings so the form can follow what the payment processors in use require of a merchant. Safe to import in the browser.
import { z } from 'zod';

/** Every document type the owner screen can ask for. The first four are the default set. */
export const KYC_DOC_CATALOG = [
  'id_front',
  'id_back',
  'business_registration',
  'address_proof',
  'bank_proof',
  'tax_certificate',
  'selfie_with_id',
] as const;
export type KycDocType = (typeof KYC_DOC_CATALOG)[number];

export const DEFAULT_REQUIRED_DOCUMENTS: readonly KycDocType[] = [
  'id_front',
  'id_back',
  'business_registration',
  'address_proof',
];

export const KYC_MODES = ['manual', 'automatic'] as const;
export type KycMode = (typeof KYC_MODES)[number];
export const KYC_PROVIDERS = ['none', 'sumsub'] as const;
export type KycProvider = (typeof KYC_PROVIDERS)[number];
export const KYC_PRESENTATIONS = ['hosted', 'embedded'] as const;
export type KycPresentation = (typeof KYC_PRESENTATIONS)[number];

export type BusinessFieldKind = 'text' | 'textarea' | 'url' | 'tel' | 'date' | 'country' | 'select';
export interface BusinessFieldDef {
  id: string;
  kind: BusinessFieldKind;
  max: number;
  options?: readonly string[];
}

/** The business questions the platform team can switch on. The answers are stored encrypted with the submission. */
export const BUSINESS_FIELDS: readonly BusinessFieldDef[] = [
  { id: 'legalName', kind: 'text', max: 200 },
  { id: 'registrationNumber', kind: 'text', max: 60 },
  { id: 'taxId', kind: 'text', max: 60 },
  { id: 'incorporationCountry', kind: 'country', max: 2 },
  { id: 'incorporationDate', kind: 'date', max: 10 },
  {
    id: 'businessType',
    kind: 'select',
    max: 40,
    options: ['sole_proprietor', 'partnership', 'company', 'non_profit', 'other'],
  },
  { id: 'website', kind: 'url', max: 200 },
  { id: 'phone', kind: 'tel', max: 30 },
  { id: 'description', kind: 'textarea', max: 1000 },
  { id: 'productsSold', kind: 'textarea', max: 1000 },
  {
    id: 'monthlyVolume',
    kind: 'select',
    max: 40,
    options: ['under_1k', '1k_10k', '10k_50k', '50k_250k', 'over_250k'],
  },
  {
    id: 'averageTicket',
    kind: 'select',
    max: 40,
    options: ['under_25', '25_100', '100_500', '500_2500', 'over_2500'],
  },
  { id: 'sourceOfFunds', kind: 'textarea', max: 1000 },
];
export const BUSINESS_FIELD_IDS: readonly string[] = BUSINESS_FIELDS.map((f) => f.id);

export interface KycProfile {
  mode: KycMode;
  provider: KycProvider;
  presentation: KycPresentation;
  requiredDocuments: KycDocType[];
  optionalDocuments: KycDocType[];
  /** Business questions that are asked and must be answered. */
  businessFields: string[];
  /** True once the provider keys are saved (the keys themselves never leave the server). */
  providerConfigured: boolean;
  version: number;
}

export const DEFAULT_PROFILE: KycProfile = {
  mode: 'manual',
  provider: 'none',
  presentation: 'hosted',
  requiredDocuments: [...DEFAULT_REQUIRED_DOCUMENTS],
  optionalDocuments: [],
  businessFields: [],
  providerConfigured: false,
  version: 0,
};

/** What the platform team may send. A provider key left empty keeps the saved one. */
export const profileInput = z
  .object({
    mode: z.enum(KYC_MODES),
    provider: z.enum(KYC_PROVIDERS),
    presentation: z.enum(KYC_PRESENTATIONS),
    requiredDocuments: z.array(z.enum(KYC_DOC_CATALOG)).max(KYC_DOC_CATALOG.length),
    optionalDocuments: z.array(z.enum(KYC_DOC_CATALOG)).max(KYC_DOC_CATALOG.length),
    businessFields: z
      .array(z.string().refine((v) => BUSINESS_FIELD_IDS.includes(v), 'Unknown question.'))
      .max(BUSINESS_FIELDS.length),
    providerKeys: z
      .object({
        appToken: z.string().trim().max(200).default(''),
        secretKey: z.string().trim().max(200).default(''),
        levelName: z.string().trim().max(100).default(''),
        webhookSecret: z.string().trim().max(200).default(''),
      })
      .strict()
      .default({ appToken: '', secretKey: '', levelName: '', webhookSecret: '' }),
    version: z.number().int().min(0),
  })
  .strict()
  .superRefine((v, ctx) => {
    const both = v.requiredDocuments.filter((d) => v.optionalDocuments.includes(d));
    if (both.length > 0)
      ctx.addIssue({ code: 'custom', message: 'A document cannot be both required and optional.' });
    if (new Set(v.requiredDocuments).size !== v.requiredDocuments.length)
      ctx.addIssue({ code: 'custom', message: 'A document is listed twice.' });
    if (v.mode === 'manual' && v.requiredDocuments.length === 0)
      ctx.addIssue({
        code: 'custom',
        message: 'Manual verification needs at least one required document.',
      });
    if (v.mode === 'automatic' && v.provider === 'none')
      ctx.addIssue({
        code: 'custom',
        message: 'Choose a verification service for automatic verification.',
      });
  });
export type ProfileInput = z.infer<typeof profileInput>;

/** Documents that make a submission ready: the required ones that have an accepted or waiting file. */
export function missingDocuments(
  profile: Pick<KycProfile, 'requiredDocuments'>,
  have: ReadonlySet<string>,
): KycDocType[] {
  return profile.requiredDocuments.filter((d) => !have.has(d));
}

/** The business answers the owner sends. Only the questions the platform asks are accepted; all are text. */
export function businessAnswersSchema(
  fields: readonly string[],
): z.ZodType<Record<string, string>> {
  const shape: Record<string, z.ZodString> = {};
  for (const id of fields) {
    const def = BUSINESS_FIELDS.find((f) => f.id === id);
    if (!def) continue;
    let s = z
      .string()
      .trim()
      .max(def.max)
      .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
    if (def.kind === 'country') s = s.regex(/^[A-Z]{2}$/, 'Choose a country.');
    if (def.kind === 'date') s = s.regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date.');
    if (def.kind === 'url')
      s = s.regex(/^https?:\/\/[^\s]+$/i, 'Enter a web address that starts with https://.');
    if (def.kind === 'select' && def.options)
      s = s.refine((v) => def.options?.includes(v) === true, {
        message: 'Choose one of the options.',
      });
    shape[id] = s.refine((v) => v.length > 0, { message: 'This answer is needed.' });
  }
  return z.object(shape).strict();
}
