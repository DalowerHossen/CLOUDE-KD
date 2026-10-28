// path: lib/payment/adapters/stripe/webhook.ts
// Stripe-Signature check and event mapping (docs/processors/stripe.md section 9).
import { safeEqual } from '@/lib/payment/adapters/base';
import { hmacSha256Hex } from '@/lib/utils/hash';
import type { NormalizedWebhookEvent, NormalizedWebhookEventType } from '@/types/contracts';

/** Documented default tolerance of the Stripe libraries. Never 0 (that would disable the recency check). */
export const STRIPE_TOLERANCE_SECONDS = 300;

export function parseSignatureHeader(
  header: string,
): { timestamp: string; signatures: string[] } | null {
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  return /^\d{1,12}$/.test(timestamp) && signatures.length > 0 ? { timestamp, signatures } : null;
}

export async function verifyStripeSignature(
  secret: string,
  header: string | undefined,
  rawBody: string,
  nowSeconds: number,
  toleranceSeconds: number = STRIPE_TOLERANCE_SECONDS,
): Promise<boolean> {
  if (!header || secret === '' || toleranceSeconds <= 0) return false;
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${rawBody}`);
  const matches = parsed.signatures.some((sig) => safeEqual(sig.toLowerCase(), expected));
  if (!matches) return false;
  return Math.abs(nowSeconds - +parsed.timestamp) <= toleranceSeconds;
}

const TYPE_MAP: Readonly<Record<string, NormalizedWebhookEventType>> = {
  'payment_intent.amount_capturable_updated': 'payment.authorized',
  'payment_intent.succeeded': 'payment.captured',
  'payment_intent.payment_failed': 'payment.failed',
  'payment_intent.canceled': 'payment.voided',
  'charge.refunded': 'payment.refunded',
  'charge.dispute.created': 'dispute.opened',
  'charge.dispute.updated': 'dispute.updated',
  'charge.dispute.closed': 'dispute.closed',
};

/** The Stripe event types the platform listens to (the keys of the mapping above). */
export const STRIPE_EVENT_TYPES: readonly string[] = Object.keys(TYPE_MAP);

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function parseStripeEvent(rawBody: string): NormalizedWebhookEvent {
  const event = JSON.parse(rawBody) as Record<string, unknown>;
  const data = (event.data as Record<string, unknown> | undefined)?.object as
    Record<string, unknown> | undefined;
  const stripeType = String(event.type ?? '');
  const type = TYPE_MAP[stripeType] ?? 'unknown';
  const object = data ?? {};
  const transactionId = stripeType.startsWith('payment_intent.')
    ? text(object.id)
    : text(object.payment_intent);
  const created = typeof event.created === 'number' ? new Date(event.created * 1000) : new Date();
  const payload: Record<string, unknown> = { stripeType };
  if (type === 'dispute.opened' || type === 'dispute.updated' || type === 'dispute.closed') {
    payload.disputeId = text(object.id);
    const status = text(object.status);
    if (type === 'dispute.closed' && (status === 'won' || status === 'lost'))
      payload.outcome = status;
  }
  return {
    processorId: 'stripe',
    eventId: String(event.id ?? ''),
    type,
    processorTransactionId: transactionId,
    occurredAt: created.toISOString(),
    payload,
  };
}
