// path: lib/kyc/rules.ts
// KYC rules shared by the owner screens, the reviewer screens and the services. Safe to import in the browser.
import { z } from 'zod';
import type { KycStatus } from '@/types/contracts';

export const DOC_TYPES = ['id_front', 'id_back', 'business_registration', 'address_proof'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const MAX_DOC_BYTES = 5 * 1024 * 1024;
export const DOC_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
/** Smallest accepted photo: a phone photo of a card is far larger; smaller pictures cannot be read by a person. */
export const MIN_IMAGE = { width: 600, height: 400 } as const;
/** An approved verification is valid for this long, then the owner is asked to verify again. */
export const VERIFICATION_YEARS = 2;
export const EXPIRY_WARNING_DAYS = 30;

export type SubmissionStatus =
  'draft' | 'submitted' | 'in_review' | 'changes_requested' | 'approved' | 'rejected' | 'expired';
export const OPEN_STATUSES: readonly SubmissionStatus[] = [
  'draft',
  'submitted',
  'in_review',
  'changes_requested',
];

/** Maps the detailed state to the contract: the owner must act in "changes_requested" and "rejected" (both read "rejected"). */
export function contractStatus(status: SubmissionStatus | null, expired: boolean): KycStatus {
  if (!status || status === 'draft' || status === 'expired') return 'not_submitted';
  if (status === 'approved') return expired ? 'not_submitted' : 'approved';
  if (status === 'changes_requested' || status === 'rejected') return 'rejected';
  return status === 'in_review' ? 'in_review' : 'submitted';
}

const plain = (max: number): z.ZodString =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const ownerSchema = z
  .object({
    fullName: plain(120).refine((v) => v.length >= 2, { message: 'Enter the full name.' }),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) => {
          const d = Date.parse(v);
          return (
            !Number.isNaN(d) &&
            d < Date.now() - 18 * 365.25 * 86_400_000 &&
            d > Date.parse('1900-01-01')
          );
        },
        { message: 'The person must be at least 18 years old.' },
      ),
    nationality: z.string().regex(/^[A-Z]{2}$/),
    ownershipPercent: z.string().regex(/^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/),
    idNumber: plain(60),
  })
  .strict();
export const ownersSchema = z
  .object({ owners: z.array(ownerSchema).min(1).max(6) })
  .strict()
  .refine((v) => v.owners.reduce((sum, o) => sum + Number(o.ownershipPercent), 0) <= 100.0001, {
    message: 'Ownership cannot add up to more than 100 percent.',
  });
export type Owners = z.infer<typeof ownersSchema>;

export const uploadSchema = z
  .object({
    docType: z.enum(DOC_TYPES),
    name: z.string().trim().min(1).max(150),
    mimeType: z.enum(DOC_MIME_TYPES),
    /** Base64 of the file, at most 5 MB of data. */
    dataBase64: z
      .string()
      .min(8)
      .max(7_100_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    /** Date the document stops being valid (passport, licence), when it has one. */
    expiresOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
  })
  .strict();

export function isExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  return expiresAt !== null && Date.parse(expiresAt) <= now.getTime();
}
