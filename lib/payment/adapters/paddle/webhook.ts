// path: lib/payment/adapters/paddle/webhook.ts
// Paddle webhook verification and event mapping (docs/processors/paddle.md section 9). The header `Paddle-Signature` is
// `ts=<unix seconds>;h1=<hex>`; h1 is the HMAC-SHA-256 of `<ts>:<raw body>` with the notification destination's secret
// key (`pdl_ntfset_...`). The official Node library accepts a timestamp at most 5 seconds in the past; the same limit
// is used here.
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

/** Seconds a signature stays valid (taken from the official library). */
export const SIGNATURE_TOLERANCE_SECONDS = 5;

export async function verifyPaddleWebhook(
  ctx: AdapterContext,
  request: WebhookRequest,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const secret = ctx.credentials.webhookSecret ?? '';
  const header = request.headers['paddle-signature'];
  if (secret === '' || !header || request.rawBody === '') return false;
  let ts = '';
  let h1 = '';
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === 'ts') ts = value;
    else if (key === 'h1') h1 = value;
  }
  if (!/^\d{1,12}$/.test(ts) || !/^[0-9a-fA-F]{64}$/.test(h1)) return false;
  if (nowMs - +ts * 1000 > SIGNATURE_TOLERANCE_SECONDS * 1000) return false;
  const expected = createHmac('sha256', secret)
    .update(`${ts}:${request.rawBody}`, 'utf8')
    .digest('hex');
  return safeEqual(h1.toLowerCase(), expected);
}

const EVENT_TYPES: Readonly<Record<string, NormalizedWebhookEventType>> = {
  'transaction.completed': 'payment.captured',
  'transaction.payment_failed': 'payment.failed',
  'transaction.canceled': 'payment.voided',
};

export function parsePaddleEvent(rawBody: string): NormalizedWebhookEvent {
  const event = JSON.parse(rawBody) as Record<string, unknown>;
  const kind = str(event.event_type) ?? '';
  const data = obj(event.data);
  const payload: Record<string, unknown> = { paddleEvent: kind };
  let type: NormalizedWebhookEventType = EVENT_TYPES[kind] ?? 'unknown';
  let transactionId: string | null = null;
  if (kind.startsWith('transaction.')) {
    transactionId = str(data?.id);
  } else if (kind === 'adjustment.created' || kind === 'adjustment.updated') {
    const action = str(data?.action);
    const status = str(data?.status);
    transactionId = str(data?.transaction_id);
    payload.adjustmentId = str(data?.id);
    payload.adjustmentStatus = status;
    if (action === 'refund') type = status === 'approved' ? 'payment.refunded' : 'unknown';
    else if (action === 'chargeback')
      type = kind === 'adjustment.created' ? 'dispute.opened' : 'dispute.updated';
  }
  const when = Date.parse(str(event.occurred_at) ?? '');
  return {
    processorId: 'paddle',
    eventId: str(event.event_id) ?? '',
    type,
    processorTransactionId: transactionId,
    occurredAt: new Date(Number.isNaN(when) ? Date.now() : when).toISOString(),
    payload,
  };
}
