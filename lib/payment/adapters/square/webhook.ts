// path: lib/payment/adapters/square/webhook.ts
// Square webhook verification and event mapping (docs/processors/square.md section 9). The signature is the Base64 of
// HMAC-SHA-256 over the notification URL followed by the raw body, keyed with the subscription's signature key.
import 'server-only';
import { createHmac } from 'node:crypto';
import { safeEqual } from '@/lib/payment/adapters/base';
import type {
  AdapterContext,
  NormalizedWebhookEvent,
  NormalizedWebhookEventType,
  WebhookRequest,
} from '@/types/contracts';
import { obj, str } from './api';

export async function verifySquareWebhook(
  ctx: AdapterContext,
  request: WebhookRequest,
): Promise<boolean> {
  const key = ctx.credentials.webhookSignatureKey ?? '';
  const url = ctx.credentials.webhookUrl ?? '';
  const header = request.headers['x-square-hmacsha256-signature'];
  if (key === '' || url === '' || !header || request.rawBody === '') return false;
  const expected = createHmac('sha256', key)
    .update(`${url}${request.rawBody}`, 'utf8')
    .digest('base64');
  return safeEqual(header, expected);
}

const PAYMENT_STATUS: Readonly<Record<string, NormalizedWebhookEventType>> = {
  APPROVED: 'payment.authorized',
  COMPLETED: 'payment.captured',
  CANCELED: 'payment.voided',
  FAILED: 'payment.failed',
};
const DISPUTE_CLOSED: ReadonlySet<string> = new Set(['WON', 'LOST', 'ACCEPTED']);

export function parseSquareEvent(rawBody: string): NormalizedWebhookEvent {
  const event = JSON.parse(rawBody) as Record<string, unknown>;
  const kind = str(event.type) ?? '';
  const data = obj(event.data);
  const object = obj(data?.object);
  const payload: Record<string, unknown> = { squareType: kind };
  let type: NormalizedWebhookEventType = 'unknown';
  let transactionId: string | null = null;
  if (kind === 'payment.created' || kind === 'payment.updated') {
    const payment = obj(object?.payment);
    type = PAYMENT_STATUS[str(payment?.status) ?? ''] ?? 'unknown';
    transactionId = str(payment?.id) ?? str(data?.id);
  } else if (kind === 'refund.created' || kind === 'refund.updated') {
    const refund = obj(object?.refund);
    const status = str(refund?.status);
    type = status === 'COMPLETED' ? 'payment.refunded' : 'unknown';
    transactionId = str(refund?.payment_id);
    payload.refundId = str(refund?.id);
    payload.refundStatus = status;
  } else if (kind.startsWith('dispute.')) {
    const dispute = obj(object?.object);
    const state = str(dispute?.state);
    if (kind === 'dispute.created') type = 'dispute.opened';
    else if (kind === 'dispute.state.updated')
      type = state && DISPUTE_CLOSED.has(state) ? 'dispute.closed' : 'dispute.updated';
    else type = 'dispute.updated';
    transactionId = str(obj(dispute?.disputed_payment)?.payment_id);
    payload.disputeId = str(dispute?.id) ?? str(data?.id);
    payload.disputeState = state;
  }
  const created = Date.parse(str(event.created_at) ?? '');
  return {
    processorId: 'square',
    eventId: str(event.event_id) ?? '',
    type,
    processorTransactionId: transactionId,
    occurredAt: new Date(Number.isNaN(created) ? Date.now() : created).toISOString(),
    payload,
  };
}
