// path: lib/email/inbound.ts
// Delivery feedback from providers (bounces, complaints, delivery, opens, clicks). Each provider signs its calls
// differently; this module verifies the signature first and only then reads the body. Pure: secrets are passed in.
import { createHmac, createPublicKey, timingSafeEqual, verify } from 'node:crypto';

export type InboundKind =
  'delivered' | 'opened' | 'clicked' | 'bounce_hard' | 'bounce_soft' | 'complaint';

export interface InboundEvent {
  kind: InboundKind;
  providerMessageId: string;
}

export type InboundResult =
  | { ok: true; events: InboundEvent[] }
  | { ok: false; reason: 'bad_signature' | 'bad_body' | 'stale' };

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const TOLERANCE_SECONDS = 300;

/** Resend signs with Svix: HMAC-SHA256 over "id.timestamp.body" with the base64 part of the "whsec_" secret. */
export function parseResend(
  headers: Headers,
  body: string,
  secret: string,
  now = Date.now(),
): InboundResult {
  const id = headers.get('svix-id') ?? '';
  const ts = headers.get('svix-timestamp') ?? '';
  const signatures = headers.get('svix-signature') ?? '';
  if (!id || !ts || !signatures || Math.abs(now / 1000 - Number(ts)) > TOLERANCE_SECONDS)
    return { ok: false, reason: 'stale' };
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  if (!signatures.split(' ').some((s) => safeEqual(s.replace(/^v1,/, ''), expected)))
    return { ok: false, reason: 'bad_signature' };
  let data: Record<string, unknown>;
  try {
    data = obj(JSON.parse(body));
  } catch {
    return { ok: false, reason: 'bad_body' };
  }
  const messageId = str(obj(data.data).email_id);
  const map: Record<string, InboundKind> = {
    'email.delivered': 'delivered',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.complained': 'complaint',
  };
  let kind = map[str(data.type)];
  if (str(data.type) === 'email.bounced')
    kind =
      str(obj(obj(data.data).bounce).type).toLowerCase() === 'transient'
        ? 'bounce_soft'
        : 'bounce_hard';
  return { ok: true, events: kind && messageId ? [{ kind, providerMessageId: messageId }] : [] };
}

/** Mailgun puts timestamp, token and signature in the body; HMAC-SHA256 of timestamp+token with the signing key. */
export function parseMailgun(body: string, signingKey: string, now = Date.now()): InboundResult {
  let data: Record<string, unknown>;
  try {
    data = obj(JSON.parse(body));
  } catch {
    return { ok: false, reason: 'bad_body' };
  }
  const sig = obj(data.signature);
  const timestamp = str(sig.timestamp);
  if (Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_SECONDS)
    return { ok: false, reason: 'stale' };
  const expected = createHmac('sha256', signingKey)
    .update(`${timestamp}${str(sig.token)}`)
    .digest('hex');
  if (!safeEqual(expected, str(sig.signature))) return { ok: false, reason: 'bad_signature' };
  const event = obj(data['event-data']);
  const messageId = str(obj(obj(event.message).headers)['message-id']);
  const name = str(event.event);
  let kind: InboundKind | undefined;
  if (name === 'delivered') kind = 'delivered';
  else if (name === 'opened') kind = 'opened';
  else if (name === 'clicked') kind = 'clicked';
  else if (name === 'complained') kind = 'complaint';
  else if (name === 'failed')
    kind = str(event.severity) === 'permanent' ? 'bounce_hard' : 'bounce_soft';
  // Mailgun message ids come without the angle brackets in the API answer and with them in headers.
  const clean = messageId.replace(/^<|>$/g, '');
  return { ok: true, events: kind && clean ? [{ kind, providerMessageId: clean }] : [] };
}

/** Postmark has no signature: the webhook address carries basic authentication that is compared here. */
export function parsePostmark(
  authorization: string | null,
  body: string,
  expectedUser: string,
  expectedPassword: string,
): InboundResult {
  const expected = `Basic ${Buffer.from(`${expectedUser}:${expectedPassword}`).toString('base64')}`;
  if (!authorization || !safeEqual(authorization, expected))
    return { ok: false, reason: 'bad_signature' };
  let data: Record<string, unknown>;
  try {
    data = obj(JSON.parse(body));
  } catch {
    return { ok: false, reason: 'bad_body' };
  }
  const messageId = str(data.MessageID);
  const type = str(data.RecordType);
  let kind: InboundKind | undefined;
  if (type === 'Delivery') kind = 'delivered';
  else if (type === 'Open') kind = 'opened';
  else if (type === 'Click') kind = 'clicked';
  else if (type === 'SpamComplaint') kind = 'complaint';
  else if (type === 'Bounce')
    kind = ['HardBounce', 'BadEmailAddress', 'SpamNotification', 'Blocked'].includes(str(data.Type))
      ? 'bounce_hard'
      : 'bounce_soft';
  return { ok: true, events: kind && messageId ? [{ kind, providerMessageId: messageId }] : [] };
}

/** SendGrid signs "timestamp + body" with ECDSA (P-256, SHA-256); the public key is the base64 DER from the settings. */
export function parseSendgrid(
  headers: Headers,
  body: string,
  publicKeyBase64: string,
  now = Date.now(),
): InboundResult {
  const signature = headers.get('x-twilio-email-event-webhook-signature') ?? '';
  const timestamp = headers.get('x-twilio-email-event-webhook-timestamp') ?? '';
  if (!signature || !timestamp || Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_SECONDS)
    return { ok: false, reason: 'stale' };
  let valid = false;
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    valid = verify(
      'sha256',
      Buffer.from(`${timestamp}${body}`),
      key,
      Buffer.from(signature, 'base64'),
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'bad_signature' };
  let list: unknown;
  try {
    list = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'bad_body' };
  }
  if (!Array.isArray(list)) return { ok: false, reason: 'bad_body' };
  const events: InboundEvent[] = [];
  for (const item of list) {
    const e = obj(item);
    // The id in the event is "<message id>.<filter>"; the send call returned only the first part.
    const messageId = str(e.sg_message_id).split('.')[0] ?? '';
    const name = str(e.event);
    let kind: InboundKind | undefined;
    if (name === 'delivered') kind = 'delivered';
    else if (name === 'open') kind = 'opened';
    else if (name === 'click') kind = 'clicked';
    else if (name === 'spamreport') kind = 'complaint';
    else if (name === 'bounce') kind = str(e.type) === 'blocked' ? 'bounce_soft' : 'bounce_hard';
    else if (name === 'dropped') kind = 'bounce_hard';
    if (kind && messageId) events.push({ kind, providerMessageId: messageId });
  }
  return { ok: true, events };
}
