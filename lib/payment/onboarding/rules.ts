// path: lib/payment/onboarding/rules.ts
// Shapes and rules of merchant onboarding with a processor's sign-up API (NMI Merchant Sign-Up, docs/processors/nmi.md
// section 13). Safe to import in the browser: no secrets, no network.
import { z } from 'zod';

export const ONBOARDING_PROCESSORS = ['nmi'] as const;
export type OnboardingProcessor = (typeof ONBOARDING_PROCESSORS)[number];

export const APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'cancelled',
  'underwriter_requested_information',
  'requested_information_sent',
  'boarded',
  'closed',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const FIELD_ID = /^fld_[a-z0-9_]{3,46}$/;
export const COLLECTION_ID = /^col_[a-z0-9_]{3,46}$/;
export const PACKAGE_ID = /^pkg_[a-z0-9_]{3,16}$/;
export const EXTERNAL_APPLICATION_ID = /^app_[a-f0-9]{16}$/;

/** A field value as the sign-up API takes it: text, number, true or false, a list of texts, or empty. */
export const fieldValue = z.union([
  z.string().max(4000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(1000)).max(100),
  z.null(),
]);
export type FieldValue = z.infer<typeof fieldValue>;

export const fieldEntry = z.object({ id: z.string().regex(FIELD_ID), value: fieldValue }).strict();
const fieldList = z.array(fieldEntry).max(1000);

export const collectionEntry = z
  .object({
    id: z.string().regex(COLLECTION_ID),
    records: z
      .array(z.object({ id: z.string().trim().min(1).max(100), fields: fieldList }).strict())
      .max(100),
  })
  .strict();

export const applicationData = z
  .object({ fields: fieldList, collections: z.array(collectionEntry).max(100) })
  .strict();
export type ApplicationData = z.infer<typeof applicationData>;

export const createApplicationInput = z
  .object({
    companyId: z.string().uuid(),
    packageId: z.string().regex(PACKAGE_ID),
    data: applicationData,
  })
  .strict();

export const updateApplicationInput = z
  .object({ data: applicationData, expectedVersion: z.number().int().min(1) })
  .strict();

export const noteInput = z.object({ note: z.string().trim().min(1).max(10_000) }).strict();

export const DOCUMENT_TYPES = [
  'Void Check',
  'Marketing Materials',
  '3 Months of Statements',
  'Driver License',
  'SSN Card',
  'Form SS4',
  'Other',
] as const;
export const DOCUMENT_MIME_TYPES = [
  'image/png',
  'image/jpg',
  'image/jpeg',
  'application/pdf',
] as const;
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export const documentInput = z
  .object({
    type: z.enum(DOCUMENT_TYPES),
    fileName: z.string().trim().min(1).max(200),
    mimeType: z.enum(DOCUMENT_MIME_TYPES),
    /** Base64 text of the file. A 20 MB file is about 28 MB of text; the route limit is set to match. */
    dataBase64: z
      .string()
      .min(8)
      .max(28_000_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

export const subscribeInput = z.object({ confirm: z.literal(true) }).strict();

/** One field of a package as the form needs it (the part of NMI's field description that the form uses). */
export interface PackageField {
  id: string;
  name: string;
  required: boolean;
  type: string;
  choices: string[] | null;
  min: number | null;
  max: number | null;
  regex: string | null;
  defaultValue: FieldValue;
}
export interface PackageCollection {
  id: string;
  name: string;
  description: string;
  min: number;
  max: number;
  fields: PackageField[];
}
export interface PackageDetail {
  id: string;
  name: string;
  description: string;
  rules: string[];
  fields: PackageField[];
  collections: PackageCollection[];
}

/** Text typed in a form input to the value for a field of the given type; null for an empty input. */
export function valueFromInput(type: string, raw: string): FieldValue {
  const text = raw.trim();
  if (text === '') return null;
  // The text is checked first, then read as a JSON number: the value is passed on to the API, no arithmetic is done on it.
  if (type === 'integer') return /^-?\d{1,15}$/.test(text) ? (JSON.parse(text) as number) : text;
  if (type === 'decimal')
    return /^-?\d{1,15}(\.\d{1,6})?$/.test(text) ? (JSON.parse(text) as number) : text;
  if (type === 'boolean') return text === 'true';
  return text;
}

/** Fields whose value is empty are not sent: an optional field left empty is simply absent. */
export function compactFields(
  fields: readonly { id: string; value: FieldValue }[],
): { id: string; value: FieldValue }[] {
  return fields.filter((f) => f.value !== null && f.value !== '');
}

/** True while an application can still be edited by the partner. */
export function isEditable(status: ApplicationStatus): boolean {
  return status === 'draft';
}

/** True for the states in which the merchant can receive payments or is waiting for NMI. */
export function isFinal(status: ApplicationStatus): boolean {
  return (
    status === 'boarded' || status === 'rejected' || status === 'cancelled' || status === 'closed'
  );
}

/** The application event types the webhook handles and the state each one leads to. */
export const EVENT_STATUS: Readonly<Record<string, ApplicationStatus>> = {
  'application.updated.data.requested': 'underwriter_requested_information',
  'application.approved': 'approved',
  'application.declined': 'rejected',
  'application.cancelled': 'cancelled',
  'application.merchant.boarded': 'boarded',
  'application.merchant.closed': 'closed',
};

export const webhookBody = z
  .object({
    event_id: z.string().min(1).max(64),
    event_type: z.string().min(1).max(80),
    event_body: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();
