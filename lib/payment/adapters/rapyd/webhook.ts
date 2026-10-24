// path: lib/payment/adapters/rapyd/webhook.ts
// Rapyd webhook verification and event mapping (docs/processors/rapyd.md section 9). The headers `salt`, `timestamp`
// and `signature` carry Base64( hex-text( HMAC-SHA256( secret key, webhook URL + salt + timestamp + access key +
// secret key + body ) ) ).
import 'server-only';
import { safeEqual } from '@/lib/payment/adapters/base';
import type {
  AdapterContext,
  NormalizedWebhookEvent,
  NormalizedWebhookEventType,
  WebhookRequest,
} from '@/types/contracts';
import { obj, sign, str } from './api';

/** Seconds a webhook timestamp may differ from now (a platform choice; Rapyd states no limit). */
export const TIMESTAMP_TOLERANCE_SECONDS = 300;

export async function verifyRapydWebhook(
  ctx: AdapterContext,
  request: WebhookRequest,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const access = ctx.credentials.accessKey ?? '';
  const secret = ctx.credentials.secretKey ?? '';
  const url = ctx.credentials.webhookUrl ?? '';
  const salt = request.headers.salt;
  const timestamp = request.headers.timestamp;
  const signature = request.headers.signature;
  if (!access || !secret || !url || !salt || !timestamp || !signature || request.rawBody === '')
    return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  const diff = nowMs - +timestamp * 1000;
  if (diff > TIMESTAMP_TOLERANCE_SECONDS * 1000 || diff < -TIMESTAMP_TOLERANCE_SECONDS * 1000)
    return false;
  const expected = sign([url, salt, timestamp, access, secret, request.rawBody], secret);
  // Some Rapyd samples use the URL-safe alphabet; both spellings of the same bytes are accepted.
  const received = signature.trim().replace(/-/g, '+').replace(/_/g, '/');
  return safeEqual(received, expected);
}

const EVENT_TYPES: Readonly<Record<string, NormalizedWebhookEventType>> = {
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_CANCELED: 'payment.voided',
  PAYMENT_EXPIRED: 'payment.voided',
  PAYMENT_REVERSED: 'payment.voided',
  REFUND_COMPLETED: 'payment.refunded',
  PAYMENT_DISPUTE_CREATED: 'dispute.opened',
  PAYMENT_DISPUTE_UPDATED: 'dispute.updated',
};

export function parseRapydEvent(rawBody: string): NormalizedWebhookEvent {
  const event = obj(JSON.parse(rawBody)) ?? {};
  const kind = str(event.type) ?? '';
  const data = obj(event.data);
  let transactionId: string | null;
  if (kind === 'REFUND_COMPLETED') transactionId = str(data?.payment);
  else if (kind.startsWith('PAYMENT_DISPUTE_')) transactionId = str(data?.original_transaction_id);
  else transactionId = str(data?.id);
  const millis =
    typeof event.extended_timestamp === 'string' || typeof event.extended_timestamp === 'number'
      ? +event.extended_timestamp
      : null;
  const seconds = typeof event.created_at === 'number' ? event.created_at : null;
  const when = millis ?? (seconds ? seconds * 1000 : Date.now());
  return {
    processorId: 'rapyd',
    eventId: str(event.id) ?? str(event.token) ?? '',
    type: EVENT_TYPES[kind] ?? 'unknown',
    processorTransactionId: transactionId,
    occurredAt: new Date(Number.isFinite(when) ? when : Date.now()).toISOString(),
    payload: { rapydEvent: kind, refundId: kind === 'REFUND_COMPLETED' ? str(data?.id) : null },
  };
}
