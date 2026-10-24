// path: lib/integrations/bank-rules.ts
// Bank feed as pure functions: the inputs of a bank link, reading a Plaid or Salt Edge transaction into the shape the books take
// (a date, a text, a reference, an id and a signed amount: money in is positive), what is left out (pending lines, duplicates,
// another currency), the key of an import batch, the checks of a Plaid webhook (a signed token) and of a Salt Edge callback (an RSA
// signature), the signature of a Salt Edge request, and what each kind of webhook means. No database or network here. Facts:
// docs/integrations/plaid.md and docs/integrations/saltedge.md.
import {
  createHash,
  createPublicKey,
  createSign,
  createVerify,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';
import {
  BANKFEED_CURRENCY,
  PLAID_COUNTRY_CODES,
  PLAID_ENVIRONMENTS,
  PLAID_WEBHOOK_MAX_AGE_SECONDS,
  SALTEDGE_KEY_VERSION,
  SALTEDGE_REQUEST_VALID_SECONDS,
} from '@/config/s16-bankfeed';
import { Money } from '@/lib/utils/currency';

const noAngle = (v: string): boolean => !/[<>]/.test(v);
const name = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(noAngle, { message: 'Angle brackets are not allowed.' });
const token = (min: number, max: number): z.ZodString =>
  z.string().trim().min(min).max(max).regex(/^\S+$/, 'It must not contain spaces.');

/* ---------- inputs ---------- */

export const plaidConnect = z
  .object({
    provider: z.literal('plaid'),
    name,
    clientId: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z]{10,60}$/, 'Paste the client id of your Plaid account.'),
    secret: token(16, 100),
    environment: z.enum(PLAID_ENVIRONMENTS).default('production'),
    countryCodes: z.array(z.enum(PLAID_COUNTRY_CODES)).min(1).max(20).default(['US']),
  })
  .strict();

export const PEM_PRIVATE_KEY =
  /^-----BEGIN (?:RSA )?PRIVATE KEY-----[A-Za-z0-9+/=\s]+-----END (?:RSA )?PRIVATE KEY-----$/;

export const saltedgeConnect = z
  .object({
    provider: z.literal('saltedge'),
    name,
    appId: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z_-]{10,80}$/, 'Paste the App id of your Salt Edge account.'),
    secret: token(16, 200),
    privateKey: z
      .string()
      .trim()
      .max(6000)
      .regex(PEM_PRIVATE_KEY, 'Paste the private key in PEM form, or leave it empty.')
      .optional(),
  })
  .strict();

export const bankConnect = z.discriminatedUnion('provider', [plaidConnect, saltedgeConnect]);

export const bankUpdate = z
  .object({
    version: z.number().int().min(1),
    name: name.optional(),
    secret: token(16, 200).optional(),
    clientId: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z]{10,60}$/)
      .optional(),
    appId: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z_-]{10,80}$/)
      .optional(),
    privateKey: z.string().trim().max(6000).regex(PEM_PRIVATE_KEY).optional(),
  })
  .strict();

export const linkInput = z.object({ returnTo: z.string().trim().max(500).optional() }).strict();

export const accountMap = z
  .object({
    bankAccountId: z.string().uuid().nullable(),
    enabled: z.boolean().default(true),
  })
  .strict();

/* ---------- lines ---------- */

export interface FeedLine {
  date: string;
  description: string;
  reference: string;
  externalId: string;
  /** Four places; positive when money comes in, negative when it goes out. */
  amount: string;
  balance: string | null;
}

export type LineVerdict =
  | { ok: true; line: FeedLine }
  | { ok: false; reason: 'pending' | 'duplicate' | 'currency' | 'invalid' | 'zero' };

const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v : '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const day = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
};
const idOf = (v: unknown): string | null => {
  const s =
    typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : typeof v === 'string' ? v : '';
  return /^[0-9A-Za-z_:.-]{1,100}$/.test(s) ? s : null;
};
const money = (v: unknown): Money | null => {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^-?\d{1,14}(\.\d+)?$/.test(s)) return null;
  try {
    return Money.parseRounded(s);
  } catch {
    return null;
  }
};

/**
 * A Plaid transaction. Plaid counts money that leaves the account as positive, the books count it as negative, so the sign is
 * turned. A pending line is left out (its posted copy comes with another id); a line in another currency is left out.
 */
export function readPlaidTransaction(json: unknown): LineVerdict {
  const t = obj(json);
  if (t.pending === true) return { ok: false, reason: 'pending' };
  const id = idOf(t.transaction_id);
  const date = day(t.date) ?? day(t.authorized_date);
  const amount = money(t.amount);
  if (id === null || date === null || amount === null) return { ok: false, reason: 'invalid' };
  const currency = typeof t.iso_currency_code === 'string' ? t.iso_currency_code.toUpperCase() : '';
  if (currency !== BANKFEED_CURRENCY) return { ok: false, reason: 'currency' };
  if (amount.isZero()) return { ok: false, reason: 'zero' };
  const meta = obj(t.payment_meta);
  const text = str(t.name, 300) || str(t.merchant_name, 300) || 'Bank transaction';
  return {
    ok: true,
    line: {
      date,
      description: text,
      reference: str(meta.reference_number, 100),
      externalId: id,
      amount: Money.zero().sub(amount).toDbString(),
      balance: null,
    },
  };
}

/**
 * A Salt Edge transaction. The sign is taken as it comes (negative when money leaves the account): the pages read do not state it,
 * see docs/integrations/saltedge.md. Pending and duplicated lines and other currencies are left out.
 */
export function readSaltEdgeTransaction(json: unknown): LineVerdict {
  const t = obj(json);
  if (t.status === 'pending') return { ok: false, reason: 'pending' };
  if (t.duplicated === true) return { ok: false, reason: 'duplicate' };
  const id = idOf(t.id);
  const date = day(t.made_on);
  const amount = money(t.amount);
  if (id === null || date === null || amount === null) return { ok: false, reason: 'invalid' };
  const currency = typeof t.currency_code === 'string' ? t.currency_code.toUpperCase() : '';
  if (currency !== BANKFEED_CURRENCY) return { ok: false, reason: 'currency' };
  if (amount.isZero()) return { ok: false, reason: 'zero' };
  const extra = obj(t.extra);
  const snapshot = money(extra.account_balance_snapshot);
  const text =
    str(t.description, 300) || str(extra.payee, 300) || str(extra.payer, 300) || 'Bank transaction';
  return {
    ok: true,
    line: {
      date,
      description: text,
      reference: str(extra.end_to_end_id, 100) || str(extra.constant_code, 100),
      externalId: id,
      amount: amount.toDbString(),
      balance: snapshot === null ? null : snapshot.toDbString(),
    },
  };
}

export interface ReadResult {
  lines: FeedLine[];
  left: { pending: number; duplicate: number; currency: number; invalid: number; zero: number };
}

/** Reads a list of provider transactions; a transaction id that comes twice (added and modified) is kept once, the last one. */
export function readTransactions(
  list: readonly unknown[],
  read: (t: unknown) => LineVerdict,
): ReadResult {
  const byId = new Map<string, FeedLine>();
  const left = { pending: 0, duplicate: 0, currency: 0, invalid: 0, zero: 0 };
  for (const entry of list) {
    const v = read(entry);
    if (v.ok) byId.set(v.line.externalId, v.line);
    else left[v.reason] += 1;
  }
  return { lines: [...byId.values()], left };
}

/** The key of an import batch: the same lines make the same key, so importing them twice changes nothing. */
export function batchKeyOf(lines: readonly FeedLine[]): string {
  const ids = lines.map((l) => l.externalId).sort();
  return createHash('sha256').update(ids.join('\n')).digest('hex').slice(0, 40);
}

/** Splits lines into chunks for the books. */
export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Can a feed account be mapped to a book account? Only USD accounts (the platform keeps one currency). */
export const mappable = (currency: string | null): boolean =>
  currency === null || currency === BANKFEED_CURRENCY;

/* ---------- Plaid webhooks ---------- */

export type PlaidEvent =
  | { kind: 'session_finished'; status: string; linkToken: string; publicTokens: string[] }
  | { kind: 'sync_updates'; itemId: string }
  | { kind: 'item_problem'; itemId: string; code: string }
  | { kind: 'login_repaired'; itemId: string }
  | { kind: 'ignored' };

const ITEM_PROBLEMS = new Set([
  'ERROR',
  'PENDING_EXPIRATION',
  'PENDING_DISCONNECT',
  'USER_PERMISSION_REVOKED',
]);

export function parsePlaidWebhook(json: unknown): PlaidEvent {
  const w = obj(json);
  const type = typeof w.webhook_type === 'string' ? w.webhook_type : '';
  const code = typeof w.webhook_code === 'string' ? w.webhook_code : '';
  const itemId = idOf(w.item_id);
  if (type === 'LINK' && code === 'SESSION_FINISHED') {
    const linkToken = typeof w.link_token === 'string' ? w.link_token.slice(0, 200) : '';
    const tokens = Array.isArray(w.public_tokens)
      ? w.public_tokens.filter((p): p is string => typeof p === 'string' && p.length <= 200)
      : [];
    return {
      kind: 'session_finished',
      status: typeof w.status === 'string' ? w.status : '',
      linkToken,
      publicTokens: tokens.slice(0, 5),
    };
  }
  if (type === 'TRANSACTIONS' && code === 'SYNC_UPDATES_AVAILABLE' && itemId !== null)
    return { kind: 'sync_updates', itemId };
  if (type === 'ITEM' && itemId !== null) {
    if (code === 'LOGIN_REPAIRED') return { kind: 'login_repaired', itemId };
    if (ITEM_PROBLEMS.has(code)) {
      const error = obj(w.error);
      const detail = typeof error.error_code === 'string' ? error.error_code : code;
      // An ERROR webhook that is not a login problem (a temporary failure) is not a reason to ask the owner to log in again.
      if (code === 'ERROR' && detail !== 'ITEM_LOGIN_REQUIRED') return { kind: 'ignored' };
      return { kind: 'item_problem', itemId, code: detail.slice(0, 60) };
    }
  }
  return { kind: 'ignored' };
}

const b64url = (s: string): Buffer =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** The header of a Plaid-Verification token without trusting it: the algorithm and the key id. */
export function plaidTokenHeader(jwt: string): { alg: string; kid: string } | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const h = obj(JSON.parse(b64url(parts[0] ?? '').toString('utf8')));
    if (typeof h.alg !== 'string' || typeof h.kid !== 'string') return null;
    return { alg: h.alg, kid: h.kid };
  } catch {
    return null;
  }
}

/**
 * Checks a Plaid webhook: the token is ES256, the signature fits the key, the token is at most 5 minutes old, and the SHA-256 of
 * the raw body is the one the token names. Every other case is a refusal.
 */
export function verifyPlaidWebhook(
  jwt: string,
  jwk: Record<string, unknown>,
  rawBody: string,
  nowSeconds: number,
): boolean {
  const parts = jwt.split('.');
  const header = plaidTokenHeader(jwt);
  if (parts.length !== 3 || header === null || header.alg !== 'ES256') return false;
  try {
    const key = createPublicKey({ key: jwk as never, format: 'jwk' });
    const ok = createVerify('SHA256')
      .update(`${parts[0]}.${parts[1]}`)
      .verify({ key, dsaEncoding: 'ieee-p1363' }, b64url(parts[2] ?? ''));
    if (!ok) return false;
    const claims = obj(JSON.parse(b64url(parts[1] ?? '').toString('utf8')));
    const iat = typeof claims.iat === 'number' ? claims.iat : -1;
    if (iat < 0 || nowSeconds - iat > PLAID_WEBHOOK_MAX_AGE_SECONDS || iat - nowSeconds > 60)
      return false;
    const claimed =
      typeof claims.request_body_sha256 === 'string' ? claims.request_body_sha256 : '';
    const actual = createHash('sha256').update(rawBody).digest('hex');
    return (
      claimed.length === actual.length &&
      timingSafeEqual(Buffer.from(claimed, 'utf8'), Buffer.from(actual, 'utf8'))
    );
  } catch {
    return false;
  }
}

/* ---------- Salt Edge callbacks and requests ---------- */

export type SaltEdgeEvent =
  | { kind: 'success'; connectionId: string; customerId: string; stage: string; appRef: string }
  | { kind: 'fail'; connectionId: string; customerId: string; errorClass: string; appRef: string }
  | { kind: 'destroy'; connectionId: string; customerId: string; appRef: string }
  | { kind: 'consent'; connectionId: string; customerId: string; status: string; appRef: string }
  | { kind: 'ignored' };

/**
 * What a Salt Edge callback says. `appRef` is the value the platform put in custom_fields.kd when it started the session. All
 * callbacks may go to one address, so the kind comes from the data: a consent status, an error class, a stage (only `finish` ends
 * a fetch; the stages of Notify are other words), or nothing of these (a Destroy callback).
 */
export function parseSaltEdgeCallback(json: unknown): SaltEdgeEvent {
  const data = obj(obj(json).data);
  const connectionId = idOf(data.connection_id);
  const customerId = idOf(data.customer_id);
  if (connectionId === null || customerId === null) return { kind: 'ignored' };
  const appRef = str(obj(data.custom_fields).kd, 60);
  if (typeof data.consent_status === 'string')
    return { kind: 'consent', connectionId, customerId, status: data.consent_status, appRef };
  if (typeof data.error_class === 'string')
    return {
      kind: 'fail',
      connectionId,
      customerId,
      errorClass: data.error_class.slice(0, 60),
      appRef,
    };
  if (typeof data.stage === 'string')
    return data.stage === 'finish'
      ? { kind: 'success', connectionId, customerId, stage: data.stage, appRef }
      : { kind: 'ignored' };
  return { kind: 'destroy', connectionId, customerId, appRef };
}

/** The public key of Salt Edge for callbacks (key version 6.0, from the documentation). */
export const SALTEDGE_CALLBACK_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8qxSS5BmftHK/eyW+o98
NR89TyDmz1V8e6yyFdoMPddEYN4Bcidkk2whoJEc/T/AKghHQ9Nq+DuebnRYYcSJ
YT99VbR1PpIw2R9i8z+DZ79hoizy6z+rwxGANnJOr5BDF5HUKJ8uKS9yGRieojFv
Y9j+rxH6Fj6P90bO4d2igYYspKVoI3Zb3hWS0LrWN+JXAaW9qcOmQPTgO0WG0MUK
gB3NNMfN7gMIkl3chbaULiEgVciP2qZTIGb1b7IDr5+fA9oVVGaXiybdieGHIa4J
S7JNTf0JjWrIKd2DaczKULnghqNQsnoCu+S8BurEOJR5EN1BBfQBPlbSh+ru1zgZ
AQIDAQAB
-----END PUBLIC KEY-----`;

/**
 * Checks a Salt Edge callback: the base64 SHA-256 RSA signature of "callback_url|post_body" made with the Salt Edge key. The key
 * version header has to be the one this code knows.
 */
export function verifySaltEdgeCallback(
  callbackUrl: string,
  rawBody: string,
  signature: string | null,
  keyVersion: string | null,
  publicKeyPem: string = SALTEDGE_CALLBACK_KEY,
): boolean {
  if (signature === null || signature === '') return false;
  if (keyVersion !== null && keyVersion !== SALTEDGE_KEY_VERSION) return false;
  try {
    return createVerify('SHA256')
      .update(`${callbackUrl}|${rawBody}`)
      .verify(publicKeyPem, Buffer.from(signature.trim(), 'base64'));
  } catch {
    return false;
  }
}

/** The headers that sign a Salt Edge request: Expires-at and the base64 SHA-256 RSA signature of "expires|METHOD|url|body". */
export function signSaltEdgeRequest(
  privateKeyPem: string,
  method: string,
  url: string,
  body: string,
  nowSeconds: number,
): { 'expires-at': string; signature: string } {
  const expires = String(nowSeconds + SALTEDGE_REQUEST_VALID_SECONDS);
  const signature = createSign('SHA256')
    .update(`${expires}|${method.toUpperCase()}|${url}|${body}`)
    .sign(privateKeyPem, 'base64');
  return { 'expires-at': expires, signature };
}

/* ---------- re-authentication ---------- */

/** Plaid item problems that ask the owner to link the bank again. */
export const needsReauth = (code: string): boolean =>
  [
    'ITEM_LOGIN_REQUIRED',
    'PENDING_EXPIRATION',
    'PENDING_DISCONNECT',
    'USER_PERMISSION_REVOKED',
  ].includes(code);

/** Salt Edge failures where the owner has to log in again. */
export const saltedgeNeedsReauth = (errorClass: string): boolean =>
  errorClass === 'InvalidCredentials';

/* ---------- small helpers (kept here so the services stay free of number arithmetic) ---------- */

/** The current time in whole seconds. */
export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** A whole number from a database value or a header text; 0 when it is not one. */
export const wholeNumber = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseInt(v, 10) : 0;
  return Number.isSafeInteger(n) ? n : 0;
};
