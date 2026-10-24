// path: lib/payment/adapters/braintree/webhook.ts
// Braintree webhook verification and event mapping (docs/processors/braintree.md section 9). The delivery is a form post
// with `bt_signature` and `bt_payload`; the payload is Base64 XML. Verification is the HMAC-SHA1 scheme of Braintree's own
// SDK: key = SHA1(private key), data = the payload text, signature pairs `publicKey|hex` joined by `&`.
import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { safeEqual } from '@/lib/payment/adapters/base';
import type {
  AdapterContext,
  NormalizedWebhookEvent,
  NormalizedWebhookEventType,
  WebhookRequest,
} from '@/types/contracts';
import { obj, str } from './api';

const PAYLOAD_CHARACTERS = /^[A-Za-z0-9+=/\n]+$/;
const LEGACY_ID = /^[a-z0-9]{4,40}$/;

function fields(rawBody: string): { signature: string; payload: string } | null {
  const form = new URLSearchParams(rawBody);
  const signature = form.get('bt_signature');
  const payload = form.get('bt_payload');
  if (!signature || !payload || !PAYLOAD_CHARACTERS.test(payload)) return null;
  return { signature, payload };
}

function signatureFor(privateKey: string, data: string): string {
  const key = createHash('sha1').update(privateKey, 'binary').digest();
  return createHmac('sha1', key).update(data, 'binary').digest('hex');
}

export async function verifyBraintreeWebhook(
  ctx: AdapterContext,
  request: WebhookRequest,
): Promise<boolean> {
  const publicKey = ctx.credentials.publicKey ?? '';
  const privateKey = ctx.credentials.privateKey ?? '';
  if (publicKey === '' || privateKey === '') return false;
  const received = fields(request.rawBody);
  if (!received) return false;
  const pair = received.signature
    .split('&')
    .filter((p) => p.includes('|'))
    .map((p) => p.split('|'))
    .find((p) => p[0] === publicKey);
  const signature = pair?.[1];
  if (!signature) return false;
  // The SDK accepts the payload as received or with a trailing newline.
  return [received.payload, `${received.payload}\n`].some((data) =>
    safeEqual(signature, signatureFor(privateKey, data)),
  );
}

/** Legacy ids (used inside webhooks) to GraphQL ids: Base64 of `<type>_<legacy id>`, shown without padding. */
export function graphqlId(type: 'transaction', legacyId: string): string | null {
  if (!LEGACY_ID.test(legacyId)) return null;
  return Buffer.from(`${type}_${legacyId}`, 'utf8').toString('base64').replace(/=+$/, '');
}

const TYPE_MAP: Readonly<Record<string, NormalizedWebhookEventType>> = {
  dispute_opened: 'dispute.opened',
  dispute_under_review: 'dispute.updated',
  dispute_disputed: 'dispute.updated',
  dispute_won: 'dispute.closed',
  dispute_lost: 'dispute.closed',
  dispute_accepted: 'dispute.closed',
  dispute_auto_accepted: 'dispute.closed',
  dispute_expired: 'dispute.closed',
  transaction_settled: 'payment.captured',
  transaction_settlement_declined: 'payment.failed',
};

const parser = new XMLParser({
  ignoreAttributes: true,
  processEntities: false,
  parseTagValue: false,
});

export function parseBraintreeEvent(rawBody: string): NormalizedWebhookEvent {
  const received = fields(rawBody);
  if (!received) throw new Error('not a Braintree delivery');
  const xml = Buffer.from(received.payload, 'base64').toString('utf8');
  const notification = obj(obj(parser.parse(xml) as unknown)?.notification);
  const kind = str(notification?.kind) ?? '';
  const type = TYPE_MAP[kind] ?? 'unknown';
  const subject = obj(notification?.subject);
  const dispute = obj(subject?.dispute);
  const transaction = obj(dispute?.transaction) ?? obj(subject?.transaction);
  const legacyId = str(transaction?.id);
  const time = Date.parse(str(notification?.timestamp) ?? '');
  const payload: Record<string, unknown> = { braintreeKind: kind };
  if (type.startsWith('dispute.')) payload.disputeId = str(dispute?.id);
  return {
    processorId: 'braintree',
    eventId: `bt_${createHash('sha256').update(received.payload).digest('hex')}`,
    type,
    processorTransactionId: legacyId ? graphqlId('transaction', legacyId) : null,
    occurredAt: new Date(Number.isNaN(time) ? Date.now() : time).toISOString(),
    payload,
  };
}

const CHALLENGE = /^[a-f0-9]{20,32}$/;

/**
 * Answer to the destination check Braintree makes when a webhook URL is created: a GET with `bt_challenge`, answered
 * with `<public key>|<HMAC-SHA1 of the challenge>` (from the `verify` method of Braintree's own SDK). Null for a
 * challenge of the wrong shape or missing keys.
 */
export function braintreeChallengeResponse(ctx: AdapterContext, challenge: string): string | null {
  const publicKey = ctx.credentials.publicKey ?? '';
  const privateKey = ctx.credentials.privateKey ?? '';
  if (publicKey === '' || privateKey === '' || !CHALLENGE.test(challenge)) return null;
  return `${publicKey}|${signatureFor(privateKey, challenge)}`;
}
