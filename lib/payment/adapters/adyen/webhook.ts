// path: lib/payment/adapters/adyen/webhook.ts
// Adyen Standard webhook verification and event mapping (docs/processors/adyen.md section 9). Every notification item
// carries `additionalData.hmacSignature` = base64(HMAC-SHA256(hex key bytes, the eight fields joined by colons)). A
// delivery is accepted only when every item verifies.
import 'server-only';
import { createHmac } from 'node:crypto';
import { safeEqual } from '@/lib/payment/adapters/base';
import type {
  AdapterContext,
  NormalizedWebhookEvent,
  NormalizedWebhookEventType,
  WebhookRequest,
} from '@/types/contracts';
import { list, obj, str, type Json } from './api';

function items(rawBody: string): Json[] {
  const body = obj(JSON.parse(rawBody));
  return list(body?.notificationItems)
    .map((entry) => obj(entry.NotificationRequestItem))
    .filter((item): item is Json => item !== null);
}

function fieldText(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

export function signedData(item: Json): string {
  const amount = obj(item.amount);
  return [
    fieldText(item.pspReference),
    fieldText(item.originalReference),
    fieldText(item.merchantAccountCode),
    fieldText(item.merchantReference),
    fieldText(amount?.value),
    fieldText(amount?.currency),
    fieldText(item.eventCode),
    fieldText(item.success),
  ].join(':');
}

export async function verifyAdyenWebhook(
  ctx: AdapterContext,
  request: WebhookRequest,
): Promise<boolean> {
  const key = ctx.credentials.hmacKey ?? '';
  if (!/^([0-9A-Fa-f]{2}){16,64}$/.test(key) || request.rawBody === '') return false;
  let entries: Json[];
  try {
    entries = items(request.rawBody);
  } catch {
    return false;
  }
  if (entries.length === 0) return false;
  const raw = Buffer.from(key, 'hex');
  return entries.every((item) => {
    const received = str(obj(item.additionalData)?.hmacSignature);
    if (!received) return false;
    const expected = createHmac('sha256', raw).update(signedData(item), 'utf8').digest('base64');
    return safeEqual(received, expected);
  });
}

function typeOf(item: Json): NormalizedWebhookEventType {
  const code = str(item.eventCode) ?? '';
  const ok = str(item.success) === 'true';
  switch (code) {
    case 'AUTHORISATION':
      return ok ? 'payment.captured' : 'payment.failed';
    case 'CAPTURE_FAILED':
      return 'payment.failed';
    case 'CANCELLATION':
    case 'EXPIRE':
      return ok ? 'payment.voided' : 'unknown';
    case 'REFUND':
      return ok ? 'payment.refunded' : 'unknown';
    case 'CHARGEBACK':
    case 'NOTIFICATION_OF_CHARGEBACK':
      return 'dispute.opened';
    case 'CHARGEBACK_REVERSED':
      return 'dispute.closed';
    default:
      return 'unknown';
  }
}

export function parseAdyenEvent(rawBody: string): NormalizedWebhookEvent {
  const entries = items(rawBody);
  const item = entries.find((e) => typeOf(e) !== 'unknown') ?? entries[0] ?? {};
  const code = str(item.eventCode) ?? '';
  const payment =
    code === 'AUTHORISATION'
      ? str(item.pspReference)
      : (str(item.originalReference) ?? str(item.pspReference));
  const when = Date.parse(str(item.eventDate) ?? '');
  return {
    processorId: 'adyen',
    eventId: `${code}:${str(item.pspReference) ?? ''}:${str(item.success) ?? ''}`,
    type: typeOf(item),
    processorTransactionId: payment,
    occurredAt: new Date(Number.isNaN(when) ? Date.now() : when).toISOString(),
    payload: {
      adyenEvent: code,
      success: str(item.success),
      reason: str(item.reason),
      merchantReference: str(item.merchantReference),
      items: entries.length,
    },
  };
}
