// path: lib/payment/adapters/paypal/webhook.ts
// PayPal webhook verification (postback method) and event mapping (docs/processors/paypal.md section 9).
import 'server-only';
import { parseJson, sendHttp } from '@/lib/payment/http-client';
import type {
  AdapterContext,
  NormalizedWebhookEvent,
  NormalizedWebhookEventType,
  WebhookRequest,
} from '@/types/contracts';
import { accessToken, baseUrl, obj, str } from './api';

/** PayPal states no replay window; this is the platform rule for inbound webhooks. */
export const PAYPAL_TOLERANCE_SECONDS = 300;

const HEADERS = [
  'paypal-transmission-id',
  'paypal-transmission-time',
  'paypal-transmission-sig',
  'paypal-cert-url',
  'paypal-auth-algo',
] as const;

function hostIsPaypal(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'paypal.com' || parsed.hostname.endsWith('.paypal.com'))
    );
  } catch {
    return false;
  }
}

export async function verifyPaypalWebhook(
  ctx: AdapterContext,
  request: WebhookRequest,
  nowMs: number,
): Promise<boolean> {
  const webhookId = ctx.credentials.webhookId ?? '';
  if (webhookId === '') return false;
  const h: Record<string, string> = {};
  for (const name of HEADERS) {
    const value = request.headers[name];
    if (!value) return false;
    h[name] = value;
  }
  if (!hostIsPaypal(h['paypal-cert-url'] ?? '')) return false;
  const sent = Date.parse(h['paypal-transmission-time'] ?? '');
  if (Number.isNaN(sent) || Math.abs(nowMs - sent) > PAYPAL_TOLERANCE_SECONDS * 1000) return false;
  if (parseJson(request.rawBody) === null) return false;
  // The event must be posted exactly as received: the raw text is inserted, never parsed and written again.
  const body =
    `{"transmission_id":${JSON.stringify(h['paypal-transmission-id'])},` +
    `"transmission_time":${JSON.stringify(h['paypal-transmission-time'])},` +
    `"cert_url":${JSON.stringify(h['paypal-cert-url'])},` +
    `"auth_algo":${JSON.stringify(h['paypal-auth-algo'])},` +
    `"transmission_sig":${JSON.stringify(h['paypal-transmission-sig'])},` +
    `"webhook_id":${JSON.stringify(webhookId)},` +
    `"webhook_event":${request.rawBody}}`;
  const token = await accessToken(ctx);
  const response = await sendHttp({
    method: 'POST',
    url: `${baseUrl(ctx)}/v1/notifications/verify-webhook-signature`,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body,
  });
  if (response.status !== 200) return false;
  return parseJson(response.text)?.verification_status === 'SUCCESS';
}

const TYPE_MAP: Readonly<Record<string, NormalizedWebhookEventType>> = {
  'PAYMENT.AUTHORIZATION.CREATED': 'payment.authorized',
  'PAYMENT.AUTHORIZATION.VOIDED': 'payment.voided',
  'PAYMENT.CAPTURE.COMPLETED': 'payment.captured',
  'PAYMENT.CAPTURE.DECLINED': 'payment.failed',
  'PAYMENT.CAPTURE.DENIED': 'payment.failed',
  'PAYMENT.CAPTURE.REFUNDED': 'payment.refunded',
  'CUSTOMER.DISPUTE.CREATED': 'dispute.opened',
  'CUSTOMER.DISPUTE.UPDATED': 'dispute.updated',
  'CUSTOMER.DISPUTE.RESOLVED': 'dispute.closed',
};

export function parsePaypalEvent(rawBody: string): NormalizedWebhookEvent {
  const event = JSON.parse(rawBody) as Record<string, unknown>;
  const eventType = String(event.event_type ?? '');
  const type = TYPE_MAP[eventType] ?? 'unknown';
  const resource = obj(event.resource);
  const related = obj(obj(resource?.supplementary_data)?.related_ids);
  const created = Date.parse(String(event.create_time ?? ''));
  const payload: Record<string, unknown> = { paypalType: eventType };
  if (type.startsWith('dispute.')) payload.disputeId = str(resource?.dispute_id);
  return {
    processorId: 'paypal',
    eventId: String(event.id ?? ''),
    type,
    // Dispute resources name the disputed capture, not the order, so they carry no order id.
    processorTransactionId: type.startsWith('dispute.') ? null : str(related?.order_id),
    occurredAt: new Date(Number.isNaN(created) ? Date.now() : created).toISOString(),
    payload,
  };
}
