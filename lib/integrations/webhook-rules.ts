// path: lib/integrations/webhook-rules.ts
// Outgoing webhooks as pure functions: the inputs, the signed header and how a receiver checks it, the envelope of an event,
// the retry schedule, when an endpoint is switched off, and the clipping of a response. No database or network here.
import { z } from 'zod';
import {
  WEBHOOK_DISABLE_AFTER_FAILURES,
  WEBHOOK_EVENTS,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RESPONSE_CLIP,
  WEBHOOK_RETRY_SECONDS,
  WEBHOOK_SECRET_PREFIX,
  WEBHOOK_SECRET_RANDOM_LENGTH,
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
  API_VERSION,
} from '@/config/s16-api';
import { checkWebhookUrl } from '@/lib/integrations/ssrf';
import { randomBase62 } from '@/lib/integrations/api-key-rules';
import { checkTimestamp, signPayload, verifyHmacSignature } from '@/lib/webhook';

const plain = (min: number, max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

const url = z.string().superRefine((v, ctx) => {
  const check = checkWebhookUrl(v.trim());
  if (!check.ok) ctx.addIssue({ code: 'custom', message: check.reason });
});

const events = z
  .array(z.enum(WEBHOOK_EVENTS))
  .min(1)
  .max(WEBHOOK_EVENTS.length)
  .refine((v) => new Set(v).size === v.length, { message: 'An event is listed twice.' });

export const endpointInput = z
  .object({ url, description: plain(0, 200).default(''), events })
  .strict();

export const endpointUpdate = z
  .object({
    version: z.number().int().min(1),
    url: url.optional(),
    description: plain(0, 200).optional(),
    events: events.optional(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .strict();

export const replayInput = z.object({}).strict();

/* ---------- secret and signature ---------- */

export function makeSecret(): string {
  return WEBHOOK_SECRET_PREFIX + randomBase62(WEBHOOK_SECRET_RANDOM_LENGTH);
}

/**
 * The value of the `X-KD-Signature` header: `t=<unix seconds>,v1=<hmac>[,v1=<hmac of the previous secret>]`. The HMAC-SHA256 is over
 * `<t>.<raw body>`. While a rotated secret still overlaps, both signatures are sent so a receiver can switch without downtime.
 */
export async function signatureHeader(
  secrets: readonly string[],
  timestampSeconds: number,
  body: string,
): Promise<string> {
  const signatures = await Promise.all(
    secrets.map((s) => signPayload(s, `${timestampSeconds}.${body}`)),
  );
  return [`t=${timestampSeconds}`, ...signatures.map((s) => `v1=${s}`)].join(',');
}

/** What a receiver does: accept when the time is fresh and any `v1` value matches the HMAC made with its secret. */
export async function verifySignatureHeader(
  secret: string,
  header: string,
  body: string,
  now: Date = new Date(),
): Promise<boolean> {
  const parts = header.split(',').map((p) => p.trim());
  const t = parts.find((p) => p.startsWith('t='))?.slice(2);
  if (t === undefined || !/^\d{1,12}$/.test(t)) return false;
  const stamp = Number.parseInt(t, 10);
  if (!checkTimestamp(stamp, now, WEBHOOK_SIGNATURE_TOLERANCE_SECONDS).ok) return false;
  for (const p of parts) {
    if (p.startsWith('v1=') && (await verifyHmacSignature(secret, `${stamp}.${body}`, p.slice(3))))
      return true;
  }
  return false;
}

/* ---------- the envelope ---------- */

export interface EnvelopeInput {
  eventId: string;
  name: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export function buildEnvelope(input: EnvelopeInput): Record<string, unknown> {
  return {
    id: input.eventId,
    type: input.name,
    created: input.occurredAt,
    api_version: API_VERSION,
    data: input.payload,
  };
}

export function testEnvelope(deliveryId: string, now: Date): Record<string, unknown> {
  return buildEnvelope({
    eventId: `test_${deliveryId}`,
    name: 'webhook.test',
    occurredAt: now.toISOString(),
    payload: { message: 'This is a test event from KD SOLUTION IT.' },
  });
}

export function deliveryHeaders(input: {
  deliveryId: string;
  eventId: string;
  eventName: string;
  attempt: number;
  signature: string;
}): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
    'user-agent': 'KD-Webhooks/1',
    'x-kd-signature': input.signature,
    'x-kd-event': input.eventName,
    'x-kd-event-id': input.eventId,
    'x-kd-delivery': input.deliveryId,
    'x-kd-attempt': String(input.attempt),
  };
}

/* ---------- retries ---------- */

export type AfterAttempt =
  { status: 'succeeded' } | { status: 'retrying'; delaySeconds: number } | { status: 'dead' };

export const isSuccess = (statusCode: number | null): boolean =>
  statusCode !== null && statusCode >= 200 && statusCode <= 299;

/** What happens after attempt number `attempt` (1 based): done, try again after a delay, or give up. */
export function afterAttempt(attempt: number, ok: boolean): AfterAttempt {
  if (ok) return { status: 'succeeded' };
  if (attempt >= WEBHOOK_MAX_ATTEMPTS) return { status: 'dead' };
  return { status: 'retrying', delaySeconds: WEBHOOK_RETRY_SECONDS[attempt - 1] ?? 86_400 };
}

/** True when the failures in a row reach the limit at which the endpoint is switched off. */
export const shouldDisable = (consecutiveFailures: number): boolean =>
  consecutiveFailures >= WEBHOOK_DISABLE_AFTER_FAILURES;

export function clipBody(text: string): string {
  return text.length <= WEBHOOK_RESPONSE_CLIP ? text : text.slice(0, WEBHOOK_RESPONSE_CLIP);
}

/** Is a secret of a rotation still valid at this time? */
export const previousSecretValid = (expiresAt: string | null, now: Date): boolean =>
  expiresAt !== null && Date.parse(expiresAt) > now.getTime();
