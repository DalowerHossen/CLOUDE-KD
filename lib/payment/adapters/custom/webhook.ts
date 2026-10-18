// path: lib/payment/adapters/custom/webhook.ts
// Webhook verification and event mapping of the custom adapter (docs/processors/custom.md section 9). The signature
// is an HMAC-SHA256 (hex or Base64) of the raw body, or of `<timestamp>.<body>` when a timestamp header is configured.
// A delivery that cannot be verified is refused: nothing is accepted unsigned.
import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import { safeEqual } from '@/lib/payment/adapters/base';
import type {
  AdapterContext,
  NormalizedWebhookEvent,
  NormalizedWebhookEventType,
  WebhookRequest,
} from '@/types/contracts';
import { setting, textAt, obj } from './api';

/** Seconds a signed timestamp may differ from now. */
export const TIMESTAMP_TOLERANCE_SECONDS = 300;

export async function verifyCustomWebhook(
  ctx: AdapterContext,
  request: WebhookRequest,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const secret = ctx.credentials.webhookSecret ?? '';
  const headerName = setting(ctx, 'signatureHeader').toLowerCase();
  const format = setting(ctx, 'signatureFormat', 'hmac_sha256_hex');
  if (secret === '' || headerName === '' || request.rawBody === '') return false;
  if (format !== 'hmac_sha256_hex' && format !== 'hmac_sha256_base64') return false;
  const received = request.headers[headerName];
  if (!received) return false;
  let signed = request.rawBody;
  const timestampHeader = setting(ctx, 'timestampHeader').toLowerCase();
  if (timestampHeader !== '') {
    const timestamp = request.headers[timestampHeader] ?? '';
    if (!/^\d{1,12}$/.test(timestamp)) return false;
    const diff = nowMs - +timestamp * 1000;
    if (diff > TIMESTAMP_TOLERANCE_SECONDS * 1000 || diff < -TIMESTAMP_TOLERANCE_SECONDS * 1000)
      return false;
    signed = `${timestamp}.${request.rawBody}`;
  }
  const digest = createHmac('sha256', secret).update(signed, 'utf8');
  if (format === 'hmac_sha256_hex')
    return safeEqual(received.trim().toLowerCase(), digest.digest('hex'));
  return safeEqual(received.trim(), digest.digest('base64'));
}

const EVENT_TYPES: Readonly<Record<string, NormalizedWebhookEventType>> = {
  'payment.succeeded': 'payment.captured',
  'payment.failed': 'payment.failed',
  'payment.refunded': 'payment.refunded',
  'payment.canceled': 'payment.voided',
};

/** The webhook body has a fixed neutral shape: `{ id, type, data: { id } }` (docs/processors/custom.md section 9). */
export function parseCustomEvent(rawBody: string): NormalizedWebhookEvent {
  const body = obj(JSON.parse(rawBody));
  const kind = (textAt(body, 'type') ?? '').toLowerCase();
  return {
    processorId: 'custom',
    eventId: textAt(body, 'id') ?? createHash('sha256').update(rawBody).digest('hex').slice(0, 40),
    type: EVENT_TYPES[kind] ?? 'unknown',
    processorTransactionId: textAt(body, 'data.id'),
    occurredAt: new Date().toISOString(),
    payload: { customEvent: kind },
  };
}
