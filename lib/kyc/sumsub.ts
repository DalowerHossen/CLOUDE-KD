// path: lib/kyc/sumsub.ts
// Pure helpers for the Sumsub online identity check: signing a request, checking a webhook and reading its result.
// No network and no secrets are kept here.
import { z } from 'zod';
import { hmacSha256Hex, timingSafeEqualStrings } from '@/lib/utils/hash';

export const SUMSUB_API = 'https://api.sumsub.com';

/** The header value Sumsub expects: hex HMAC-SHA256 of timestamp + METHOD + path with query + body, with the secret key. */
export function requestSignature(
  secretKey: string,
  timestampSeconds: number,
  method: string,
  pathWithQuery: string,
  body: string,
): Promise<string> {
  return hmacSha256Hex(
    secretKey,
    `${timestampSeconds}${method.toUpperCase()}${pathWithQuery}${body}`,
  );
}

/** The path (with query) that asks for a hosted verification link for one person. */
export function linkPath(levelName: string, externalUserId: string, ttlSeconds: number): string {
  const q = new URLSearchParams({ ttlInSecs: String(ttlSeconds), externalUserId });
  return `/resources/sdkIntegrations/levels/${encodeURIComponent(levelName)}/websdkLink?${q.toString()}`;
}

const linkAnswer = z.object({ url: z.string().url() }).passthrough();
export function readLink(json: unknown): string | null {
  const parsed = linkAnswer.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data.url.startsWith('https://') ? parsed.data.url : null;
}

const WEBHOOK_ALGORITHMS = ['HMAC_SHA256_HEX'] as const;

/** Checks the digest header of a webhook against the raw body. Only SHA-256 is accepted. */
export async function verifyWebhookDigest(
  webhookSecret: string,
  rawBody: string,
  digest: string | null,
  algorithm: string | null,
): Promise<boolean> {
  if (!webhookSecret || !digest) return false;
  if (!(WEBHOOK_ALGORITHMS as readonly string[]).includes(algorithm ?? '')) return false;
  const clean = digest.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) return false;
  return timingSafeEqualStrings(clean, await hmacSha256Hex(webhookSecret, rawBody));
}

const webhookBody = z
  .object({
    type: z.string().max(80),
    externalUserId: z.string().max(120).optional(),
    applicantId: z.string().max(120).optional(),
    reviewStatus: z.string().max(40).optional(),
    reviewResult: z
      .object({
        reviewAnswer: z.string().max(20).optional(),
        reviewRejectType: z.string().max(20).optional(),
        moderationComment: z.string().max(1000).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ProviderOutcome = 'approved' | 'retry' | 'rejected';
export interface ProviderEvent {
  externalUserId: string;
  applicantId: string | null;
  /** True when the person finished the steps and the service is now checking. */
  pending: boolean;
  /** Null while the check is still running (nothing to apply yet). */
  outcome: ProviderOutcome | null;
  comment: string;
}

/** Reads one webhook body. Returns null when it is not a usable event. */
export function readWebhook(json: unknown): ProviderEvent | null {
  const parsed = webhookBody.safeParse(json);
  if (!parsed.success || !parsed.data.externalUserId) return null;
  const d = parsed.data;
  const answer = d.reviewResult?.reviewAnswer;
  let outcome: ProviderOutcome | null = null;
  if (d.type === 'applicantReviewed' && answer === 'GREEN') outcome = 'approved';
  else if (d.type === 'applicantReviewed' && answer === 'RED')
    outcome = d.reviewResult?.reviewRejectType === 'RETRY' ? 'retry' : 'rejected';
  return {
    externalUserId: d.externalUserId ?? '',
    applicantId: d.applicantId ?? null,
    pending: d.type === 'applicantPending',
    outcome,
    comment: (d.reviewResult?.moderationComment ?? '').replace(/[<>]/g, '').slice(0, 500),
  };
}
