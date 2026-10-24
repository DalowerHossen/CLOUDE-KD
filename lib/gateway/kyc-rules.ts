// path: lib/gateway/kyc-rules.ts
// Sub-merchant KYC as pure functions: the inputs of the link, the business and the review, the link token, and the readiness of a
// submission. The owners and the documents follow the same rules as the KYC of a company (lib/kyc/rules.ts).
import { z } from 'zod';
import { DOC_TYPES, type DocType, type SubmissionStatus } from '@/lib/kyc/rules';
import { randomBase62 } from '@/lib/integrations/api-key-rules';
import { sha256Hex } from '@/lib/utils/hash';

export const KYC_LINK_RANDOM_LENGTH = 40;
export const KYC_LINK_DEFAULT_DAYS = 14;
export const KYC_LINK_MAX_DAYS = 30;

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const kycLinkInput = z
  .object({
    expiresInDays: z.number().int().min(1).max(KYC_LINK_MAX_DAYS).default(KYC_LINK_DEFAULT_DAYS),
  })
  .strict();

export const kycBusinessInput = z
  .object({
    businessName: plain(2, 200),
    country: z.string().regex(/^[A-Z]{2}$/, 'Choose the country of the business.'),
  })
  .strict();

const reason = plain(5, 1000);

export const kycReviewAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }).strict(),
  z
    .object({
      action: z.literal('documents'),
      documents: z
        .array(
          z
            .object({
              id: z.string().uuid(),
              status: z.enum(['accepted', 'rejected']),
              reason: plain(0, 500).default(''),
            })
            .strict(),
        )
        .min(1)
        .max(4),
    })
    .strict(),
  z
    .object({
      action: z.literal('note'),
      risk: z.enum(['low', 'medium', 'high']).nullable(),
      note: plain(0, 4000),
    })
    .strict(),
  z
    .object({
      action: z.literal('approve'),
      /** Needed when the automatic screening did not clear the names: the reviewer checked them by hand. */
      screeningCheckedByHand: z.boolean().default(false),
    })
    .strict(),
  z.object({ action: z.literal('request_changes'), reason }).strict(),
  z.object({ action: z.literal('reject'), reason }).strict(),
]);
export type KycReviewAction = z.infer<typeof kycReviewAction>;

/** A link token is 40 letters and digits. Only its hash is stored. */
export const KYC_TOKEN_SHAPE = new RegExp(`^[0-9A-Za-z]{${KYC_LINK_RANDOM_LENGTH}}$`);

export function makeKycToken(): string {
  return randomBase62(KYC_LINK_RANDOM_LENGTH);
}

export async function hashKycToken(token: string): Promise<string> {
  return sha256Hex(`smkyc:${token}`);
}

export interface ReadinessInput {
  businessName: string | null;
  businessCountry: string | null;
  ownerCount: number;
  documents: readonly { docType: DocType; status: 'pending' | 'accepted' | 'rejected' }[];
}

/** The document types that are still missing (a rejected document counts as missing). */
export function missingDocuments(input: ReadinessInput): DocType[] {
  const have = new Set(
    input.documents.filter((d) => d.status !== 'rejected').map((d) => d.docType),
  );
  return DOC_TYPES.filter((t) => !have.has(t));
}

export function isReady(input: ReadinessInput): boolean {
  return (
    input.businessName !== null &&
    input.businessName.length >= 2 &&
    input.businessCountry !== null &&
    input.ownerCount > 0 &&
    missingDocuments(input).length === 0
  );
}

/** What the applicant may do in a state: edit (draft, changes asked), start a new round (rejected, expired), or only look. */
export function applicantMode(
  status: SubmissionStatus | 'none',
  expiresAt: string | null,
  now: Date,
  warningDays = 30,
): 'edit' | 'new_round' | 'locked' {
  if (status === 'none' || status === 'draft' || status === 'changes_requested') return 'edit';
  if (status === 'rejected' || status === 'expired') return 'new_round';
  if (status === 'approved') {
    const near =
      expiresAt !== null && Date.parse(expiresAt) - now.getTime() <= warningDays * 86_400_000;
    return near ? 'new_round' : 'locked';
  }
  return 'locked';
}

/** The state shown to people: an approval that ran out reads "expired". */
export function shownStatus(
  status: SubmissionStatus,
  expiresAt: string | null,
  now: Date,
): SubmissionStatus {
  return status === 'approved' && expiresAt !== null && Date.parse(expiresAt) <= now.getTime()
    ? 'expired'
    : status;
}

/** Until when the sub-merchant counts as verified. */
export function verifiedUntil(kycApprovedUntil: string | null, now: Date): boolean {
  return kycApprovedUntil !== null && Date.parse(kycApprovedUntil) > now.getTime();
}
