// path: lib/payment/adapters/payproglobal/webhook.ts
// PayPro Global IPN verification and event mapping (docs/processors/payproglobal.md section 9). The body is
// form-urlencoded; `SIGNATURE` is the SHA-256 (hex) of ORDER_ID + ORDER_STATUS + ORDER_TOTAL_AMOUNT + CUSTOMER_EMAIL +
// VALIDATION_KEY + TEST_MODE + IPN_TYPE_NAME, each taken verbatim from the posted fields.
import 'server-only';
import { createHash } from 'node:crypto';
import { safeEqual } from '@/lib/payment/adapters/base';
import type {
  AdapterContext,
  NormalizedWebhookEvent,
  NormalizedWebhookEventType,
  WebhookRequest,
} from '@/types/contracts';
import { ORDER_ID } from './api';

const SIGNED_FIELDS = ['ORDER_ID', 'ORDER_STATUS', 'ORDER_TOTAL_AMOUNT', 'CUSTOMER_EMAIL'] as const;

export async function verifyPayproWebhook(
  ctx: AdapterContext,
  request: WebhookRequest,
): Promise<boolean> {
  const key = ctx.credentials.validationKey ?? '';
  if (key === '' || request.rawBody === '') return false;
  const form = new URLSearchParams(request.rawBody);
  const signature = form.get('SIGNATURE') ?? '';
  const test = form.get('TEST_MODE');
  const kind = form.get('IPN_TYPE_NAME');
  if (!/^[0-9a-fA-F]{64}$/.test(signature) || test === null || !kind) return false;
  const parts: string[] = [];
  for (const name of SIGNED_FIELDS) {
    const value = form.get(name);
    if (value === null) return false;
    parts.push(value);
  }
  const expected = createHash('sha256')
    .update(`${parts.join('')}${key}${test}${kind}`, 'utf8')
    .digest('hex');
  return safeEqual(signature.toLowerCase(), expected);
}

const EVENT_TYPES: Readonly<Record<string, NormalizedWebhookEventType>> = {
  OrderCharged: 'payment.captured',
  OrderDeclined: 'payment.failed',
  OrderRefunded: 'payment.refunded',
  OrderPartiallyRefunded: 'payment.refunded',
  OrderChargedBack: 'dispute.opened',
  OrderChargedBackWon: 'dispute.closed',
};

export function parsePayproEvent(rawBody: string): NormalizedWebhookEvent {
  const form = new URLSearchParams(rawBody);
  const kind = form.get('IPN_TYPE_NAME') ?? '';
  const orderId = form.get('ORDER_ID') ?? '';
  const eventId = [
    form.get('IPN_TYPE_ID') ?? '',
    orderId,
    form.get('ORDER_ITEM_ID') ?? '',
    form.get('ORDER_REFUNDED') ?? '',
  ].join(':');
  return {
    processorId: 'payproglobal',
    eventId,
    type: EVENT_TYPES[kind] ?? 'unknown',
    processorTransactionId: ORDER_ID.test(orderId) ? orderId : null,
    occurredAt: new Date().toISOString(),
    payload: {
      payproEvent: kind,
      testMode: form.get('TEST_MODE'),
      reason: form.get('ACTION_REASON'),
      resent: form.get('IS_RESENT') === '1',
    },
  };
}
