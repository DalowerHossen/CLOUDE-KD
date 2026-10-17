// path: lib/payment/adapters/verifone/webhook.ts
// Verifone notification verification and event mapping (docs/processors/verifone.md section 9). The `x-vfi-jws` header
// carries a detached JSON Web Signature (RFC 7515 with the unencoded payload option of RFC 7797) over the body in its
// canonical JSON form (RFC 8785). The public keys are a JWKS file that Verifone publishes per environment; the file is
// cached and fetched again only when a key id is unknown.
import 'server-only';
import { createHash, createPublicKey, constants, verify as cryptoVerify } from 'node:crypto';
import type { JsonWebKey, KeyObject } from 'node:crypto';
import { parseJson, sendHttp } from '@/lib/payment/http-client';
import type {
  AdapterContext,
  NormalizedWebhookEvent,
  NormalizedWebhookEventType,
  WebhookRequest,
} from '@/types/contracts';
import { jwksUrl, list, obj, str, type Json } from './api';

/** RFC 8785: members sorted by their UTF-16 code units, strings and numbers as ECMAScript prints them. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError('not a JSON number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = obj(value);
  if (!record) throw new RangeError('not a JSON value');
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
}

interface Algorithm {
  hash: 'sha256' | 'sha384' | 'sha512';
  kind: 'RSA' | 'PSS' | 'EC';
  curve?: string;
}
const ALGORITHMS: Readonly<Record<string, Algorithm>> = {
  RS256: { hash: 'sha256', kind: 'RSA' },
  RS384: { hash: 'sha384', kind: 'RSA' },
  RS512: { hash: 'sha512', kind: 'RSA' },
  PS256: { hash: 'sha256', kind: 'PSS' },
  PS384: { hash: 'sha384', kind: 'PSS' },
  PS512: { hash: 'sha512', kind: 'PSS' },
  ES256: { hash: 'sha256', kind: 'EC', curve: 'P-256' },
  ES384: { hash: 'sha384', kind: 'EC', curve: 'P-384' },
  ES512: { hash: 'sha512', kind: 'EC', curve: 'P-521' },
};
const HASH_BYTES: Readonly<Record<Algorithm['hash'], number>> = {
  sha256: 32,
  sha384: 48,
  sha512: 64,
};

const KEYS_TTL_MS = 6 * 60 * 60 * 1000;
const REFRESH_GAP_MS = 5 * 60 * 1000;
interface CachedKeys {
  keys: Json[];
  fetchedAt: number;
}
const cache = new Map<string, CachedKeys>();

/** Used by scripts/verify only. */
export function resetKeyCacheForVerification(): void {
  cache.clear();
}

async function loadKeys(url: string, force: boolean): Promise<Json[]> {
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && !force && now - cached.fetchedAt < KEYS_TTL_MS) return cached.keys;
  // An unknown key id may trigger one refresh in five minutes at most, so forged headers cannot cause a download storm.
  if (cached && force && now - cached.fetchedAt < REFRESH_GAP_MS) return cached.keys;
  const response = await sendHttp({
    method: 'GET',
    url,
    headers: { accept: 'application/json' },
  });
  if (response.status !== 200) return cached?.keys ?? [];
  const keys = list(parseJson(response.text)?.keys);
  if (keys.length === 0) return cached?.keys ?? [];
  cache.set(url, { keys, fetchedAt: now });
  return keys;
}

function decodeBase64Url(text: string): Buffer | null {
  return /^[A-Za-z0-9_-]*$/.test(text) ? Buffer.from(text, 'base64url') : null;
}

async function findKey(url: string, kid: string): Promise<Json | null> {
  const first = (await loadKeys(url, false)).find((k) => k.kid === kid);
  if (first) return first;
  return (await loadKeys(url, true)).find((k) => k.kid === kid) ?? null;
}

function importKey(jwk: Json, algorithm: Algorithm, alg: string): KeyObject | null {
  const expectedType = algorithm.kind === 'EC' ? 'EC' : 'RSA';
  if (jwk.kty !== expectedType) return null;
  if (typeof jwk.alg === 'string' && jwk.alg !== alg) return null;
  if (typeof jwk.use === 'string' && jwk.use !== 'sig') return null;
  if (algorithm.kind === 'EC' && jwk.crv !== algorithm.curve) return null;
  try {
    return createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
  } catch {
    return null;
  }
}

/** Checks the detached signature of the body. Every failure, including a missing key file, means "not verified". */
export async function verifyVerifoneWebhook(
  ctx: AdapterContext,
  request: WebhookRequest,
): Promise<boolean> {
  const header = request.headers['x-vfi-jws'];
  if (!header || request.rawBody === '') return false;
  const parts = header.split('.');
  if (parts.length !== 3 || parts[1] !== '') return false;
  const [protectedPart = '', , signaturePart = ''] = parts;
  const headerBytes = decodeBase64Url(protectedPart);
  const signature = decodeBase64Url(signaturePart);
  if (!headerBytes || !signature || signature.length === 0) return false;
  const protectedHeader = parseJson(headerBytes.toString('utf8'));
  if (!protectedHeader) return false;
  const alg = str(protectedHeader.alg);
  const kid = str(protectedHeader.kid);
  const algorithm = alg ? ALGORITHMS[alg] : undefined;
  if (!alg || !algorithm || !kid) return false;
  // Only the unencoded payload option may be marked critical.
  const crit = protectedHeader.crit;
  if (crit !== undefined && !(Array.isArray(crit) && crit.length === 1 && crit[0] === 'b64'))
    return false;
  const unencoded = protectedHeader.b64 === false;
  if (unencoded && crit === undefined) return false;
  let canonical: string;
  try {
    canonical = canonicalJson(JSON.parse(request.rawBody));
  } catch {
    return false;
  }
  const payload = Buffer.from(canonical, 'utf8');
  const signingInput = Buffer.concat([
    Buffer.from(`${protectedPart}.`, 'ascii'),
    unencoded ? payload : Buffer.from(payload.toString('base64url'), 'ascii'),
  ]);
  try {
    const jwk = await findKey(jwksUrl(ctx.environment), kid);
    if (!jwk) return false;
    const key = importKey(jwk, algorithm, alg);
    if (!key) return false;
    if (algorithm.kind === 'EC') {
      return cryptoVerify(
        algorithm.hash,
        signingInput,
        { key, dsaEncoding: 'ieee-p1363' },
        signature,
      );
    }
    if (algorithm.kind === 'PSS') {
      return cryptoVerify(
        algorithm.hash,
        signingInput,
        { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: HASH_BYTES[algorithm.hash] },
        signature,
      );
    }
    return cryptoVerify(algorithm.hash, signingInput, key, signature);
  } catch {
    return false;
  }
}

const EVENT_TYPES: Readonly<Record<string, NormalizedWebhookEventType>> = {
  TxnAuthorisationApproved: 'payment.authorized',
  TxnAuthorisationDeclined: 'payment.failed',
  TxnSaleApproved: 'payment.captured',
  TxnSaleDeclined: 'payment.failed',
  TxnSaleConfirmed: 'payment.captured',
  TxnCaptureApproved: 'payment.captured',
  TxnCaptureDeclined: 'payment.failed',
  TxnDelayedChargeApproved: 'payment.captured',
  TxnDelayedChargeDeclined: 'payment.failed',
  TxnVoidApproved: 'payment.voided',
  TxnRefundApproved: 'payment.refunded',
};

export function parseVerifoneEvent(rawBody: string): NormalizedWebhookEvent {
  const event = JSON.parse(rawBody) as Record<string, unknown>;
  const kind = str(event.eventType) ?? '';
  const objectType = str(event.objectType);
  const content = obj(event.content);
  const record = str(event.recordId) ?? str(event.eventId) ?? '';
  const occurred = str(event.eventDateTime) ?? '';
  const isTransaction = objectType === 'TransactionEvent' || kind.startsWith('Txn');
  const transactionId = isTransaction
    ? (str(content?.id) ?? str(event.itemId) ?? (record === '' ? null : record))
    : null;
  const when = Date.parse(occurred);
  const payload: Record<string, unknown> = { verifoneEvent: kind };
  if (objectType) payload.objectType = objectType;
  const status = str(content?.transaction_status);
  if (status) payload.transactionStatus = status;
  const reference = str(content?.merchant_reference);
  if (reference) payload.merchantReference = reference;
  return {
    processorId: 'verifone',
    // The event id of a transaction event is the transaction id, which repeats for each step of the same payment, so
    // the event type and time are part of the identity. A resent notification keeps all three.
    eventId: `vf_${createHash('sha256').update(`${kind}|${record}|${occurred}`).digest('hex').slice(0, 40)}`,
    type: EVENT_TYPES[kind] ?? 'unknown',
    processorTransactionId: transactionId,
    occurredAt: new Date(Number.isNaN(when) ? Date.now() : when).toISOString(),
    payload,
  };
}
