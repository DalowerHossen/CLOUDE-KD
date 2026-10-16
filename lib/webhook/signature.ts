// path: lib/webhook/signature.ts
// Generic webhook signature helpers: HMAC-SHA256 over the raw body, compared in constant time.
// Processor adapters (STEPs 10 to 12) decide the exact signed string from the processor documentation
// and call these helpers; nothing here encodes a processor-specific format.
import { hmacSha256Hex, sha256Hex, timingSafeEqualStrings } from '@/lib/utils/hash';

export const DEFAULT_TOLERANCE_SECONDS = 300;

export type WebhookCheck =
  { ok: true } | { ok: false; reason: 'bad_signature' | 'stale' | 'future' };

/** Hex HMAC-SHA256 of the payload. */
export function signPayload(secret: string, payload: string): Promise<string> {
  return hmacSha256Hex(secret, payload);
}

/** Compares a supplied hex signature (optionally prefixed such as "sha256=") with the expected one. */
export async function verifyHmacSignature(
  secret: string,
  payload: string,
  supplied: string,
): Promise<boolean> {
  const clean = supplied
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, '');
  if (!/^[0-9a-f]{64}$/.test(clean)) return false;
  return timingSafeEqualStrings(clean, await signPayload(secret, payload));
}

/** Accepts a timestamp (unix seconds) only inside the tolerance window. */
export function checkTimestamp(
  timestampSeconds: number,
  now: Date = new Date(),
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): WebhookCheck {
  if (!Number.isFinite(timestampSeconds)) return { ok: false, reason: 'stale' };
  const skew = Math.floor(now.getTime() / 1000) - timestampSeconds;
  if (skew > toleranceSeconds) return { ok: false, reason: 'stale' };
  if (skew < -toleranceSeconds) return { ok: false, reason: 'future' };
  return { ok: true };
}

/** Signature plus freshness in one call, for providers that sign "<timestamp>.<body>". */
export async function verifyTimestampedSignature(input: {
  secret: string;
  timestampSeconds: number;
  body: string;
  supplied: string;
  now?: Date;
  toleranceSeconds?: number;
}): Promise<WebhookCheck> {
  const fresh = checkTimestamp(input.timestampSeconds, input.now, input.toleranceSeconds);
  if (!fresh.ok) return fresh;
  const good = await verifyHmacSignature(
    input.secret,
    `${input.timestampSeconds}.${input.body}`,
    input.supplied,
  );
  return good ? { ok: true } : { ok: false, reason: 'bad_signature' };
}

/** Stable key for deduplication when the provider sends no event id. */
export function payloadFingerprint(body: string): Promise<string> {
  return sha256Hex(body);
}
