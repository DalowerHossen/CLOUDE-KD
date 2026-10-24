// path: lib/payment/adapters/fastspring/webhook.ts
// FastSpring webhook verification and event mapping (docs/processors/fastspring.md section 9). The header
// `X-FS-Signature` is the base64 HMAC-SHA256 of the raw body with the secret typed on the webhook. A delivery may carry
// several events; the first known one is mapped. An unsigned delivery is refused (the secret is optional on
// FastSpring's side but required here).
import 'server-only';
import { createHmac } from 'node:crypto';
import { safeEqual } from '@/lib/payment/adapters/base';
import type {
  AdapterContext,
  NormalizedWebhookEvent,
  NormalizedWebhookEventType,
  WebhookRequest,
} from '@/types/contracts';
import { list, obj, str } from './api';

export async function verifyFastspringWebhook(
  ctx: AdapterContext,
  request: WebhookRequest,
): Promise<boolean> {
  const secret = ctx.credentials.webhookSecret ?? '';
  const header = request.headers['x-fs-signature'];
  if (secret === '' || !header || request.rawBody === '') return false;
  const expected = createHmac('sha256', secret).update(request.rawBody, 'utf8').digest('base64');
  return safeEqual(header.trim(), expected);
}

const EVENT_TYPES: Readonly<Record<string, NormalizedWebhookEventType>> = {
  'order.completed': 'payment.captured',
  'order.failed': 'payment.failed',
  'return.created': 'payment.refunded',
  'chargeback.created': 'dispute.opened',
};

export function parseFastspringEvent(rawBody: string): NormalizedWebhookEvent {
  const parsed = obj(JSON.parse(rawBody));
  const events = list(parsed?.events);
  const event = events.find((e) => EVENT_TYPES[str(e.type) ?? ''] !== undefined) ?? events[0];
  const kind = str(event?.type) ?? '';
  const data = obj(event?.data);
  const type = EVENT_TYPES[kind] ?? 'unknown';
  const original = obj(data?.original);
  const orderId =
    kind === 'return.created'
      ? (str(original?.order) ?? str(original?.id))
      : (str(data?.order) ?? str(data?.id));
  const payload: Record<string, unknown> = { fastspringEvent: kind, events: events.length };
  if (kind === 'return.created') payload.returnId = str(data?.return);
  if (kind === 'chargeback.created') payload.reason = str(data?.reasonDescription);
  const created = event?.created;
  return {
    processorId: 'fastspring',
    eventId: str(event?.id) ?? '',
    type,
    processorTransactionId: orderId,
    occurredAt: new Date(typeof created === 'number' ? created : Date.now()).toISOString(),
    payload,
  };
}
