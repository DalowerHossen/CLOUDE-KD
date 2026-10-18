// path: lib/payment/adapters/nmi/webhook.ts
// NMI webhook verification and event mapping (docs/processors/nmi.md section 9). The header `Webhook-Signature` is
// `t=<nonce>,s=<signature>`; the signature is the hexadecimal HMAC-SHA-256 of `<nonce>.<raw body>` with the webhook
// signing key shown on the Webhooks settings page.
import 'server-only';
import { createHmac } from 'node:crypto';
import { safeEqual } from '@/lib/payment/adapters/base';
import type {
  AdapterContext,
  NormalizedWebhookEvent,
  NormalizedWebhookEventType,
  WebhookRequest,
} from '@/types/contracts';
import { obj, str } from './shared-server';

export async function verifyNmiWebhook(
  ctx: AdapterContext,
  request: WebhookRequest,
): Promise<boolean> {
  const key = ctx.credentials.webhookSigningKey ?? '';
  const header = request.headers['webhook-signature'];
  if (key === '' || !header || request.rawBody === '') return false;
  const match = /^t=([^,]+),s=([0-9a-fA-F]+)$/.exec(header.trim());
  if (!match) return false;
  const [, nonce = '', signature = ''] = match;
  const expected = createHmac('sha256', key)
    .update(`${nonce}.${request.rawBody}`, 'utf8')
    .digest('hex');
  return safeEqual(signature.toLowerCase(), expected);
}

const EVENT_TYPES: Readonly<Record<string, NormalizedWebhookEventType>> = {
  'transaction.sale.success': 'payment.captured',
  'transaction.auth.success': 'payment.authorized',
  'transaction.capture.success': 'payment.captured',
  'transaction.void.success': 'payment.voided',
  'transaction.refund.success': 'payment.refunded',
  'transaction.sale.failure': 'payment.failed',
  'transaction.auth.failure': 'payment.failed',
  'transaction.capture.failure': 'payment.failed',
};

export function parseNmiEvent(rawBody: string): NormalizedWebhookEvent {
  const event = JSON.parse(rawBody) as Record<string, unknown>;
  const kind = str(event.event_type) ?? '';
  const body = obj(event.event_body);
  const payload: Record<string, unknown> = { nmiEvent: kind };
  const condition = str(body?.condition);
  if (condition) payload.condition = condition;
  return {
    processorId: 'nmi',
    eventId: str(event.event_id) ?? '',
    type: EVENT_TYPES[kind] ?? 'unknown',
    processorTransactionId: str(body?.transaction_id),
    // The documented body has no timestamp; the time of receipt is used.
    occurredAt: new Date().toISOString(),
    payload,
  };
}
