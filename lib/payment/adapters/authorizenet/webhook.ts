// path: lib/payment/adapters/authorizenet/webhook.ts
// Authorize.Net webhook verification and event mapping (docs/processors/authorizenet.md section 9). The header
// `X-ANET-Signature` carries the HMAC-SHA512 of the body made with the Signature Key. The page read does not say whether
// the key is used as text or as the bytes of a hexadecimal string, so both are computed and either match is accepted.
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

const HEX_KEY = /^(?:[0-9a-fA-F]{2})+$/;

export async function verifyAnetWebhook(
  ctx: AdapterContext,
  request: WebhookRequest,
): Promise<boolean> {
  const key = ctx.credentials.signatureKey ?? '';
  const header = request.headers['x-anet-signature'];
  if (key === '' || !header || request.rawBody === '') return false;
  const received = header
    .trim()
    .replace(/^sha512=/i, '')
    .toUpperCase();
  if (!/^[0-9A-F]{128}$/.test(received)) return false;
  const keys: Buffer[] = [Buffer.from(key, 'utf8')];
  if (HEX_KEY.test(key)) keys.push(Buffer.from(key, 'hex'));
  return keys
    .map((k) => createHmac('sha512', k).update(request.rawBody, 'utf8').digest('hex').toUpperCase())
    .map((expected) => safeEqual(received, expected))
    .some(Boolean);
}

const TYPE_MAP: Readonly<Record<string, NormalizedWebhookEventType>> = {
  'net.authorize.payment.authorization.created': 'payment.authorized',
  'net.authorize.payment.authcapture.created': 'payment.captured',
  'net.authorize.payment.capture.created': 'payment.captured',
  'net.authorize.payment.priorAuthCapture.created': 'payment.captured',
  'net.authorize.payment.refund.created': 'payment.refunded',
  'net.authorize.payment.void.created': 'payment.voided',
  'net.authorize.payment.fraud.approved': 'payment.authorized',
  'net.authorize.payment.fraud.declined': 'payment.failed',
};

export function parseAnetEvent(rawBody: string): NormalizedWebhookEvent {
  const event = JSON.parse(rawBody) as Record<string, unknown>;
  const eventType = str(event.eventType) ?? '';
  const payload = obj(event.payload);
  const type = TYPE_MAP[eventType] ?? 'unknown';
  const idValue = payload?.id;
  const id = typeof idValue === 'number' ? String(idValue) : str(idValue);
  const date = Date.parse(str(event.eventDate) ?? '');
  return {
    processorId: 'authorizenet',
    eventId: str(event.notificationId) ?? '',
    type,
    processorTransactionId:
      payload?.entityName === 'transaction' && id && /^\d{1,20}$/.test(id) ? id : null,
    occurredAt: new Date(Number.isNaN(date) ? Date.now() : date).toISOString(),
    payload: {
      authorizenetType: eventType,
      merchantReferenceId: str(payload?.merchantReferenceId),
    },
  };
}
