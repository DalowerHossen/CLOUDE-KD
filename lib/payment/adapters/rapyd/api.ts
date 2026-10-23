// path: lib/payment/adapters/rapyd/api.ts
// Rapyd REST calls and request signing (docs/processors/rapyd.md sections 2, 3, 5 and 10). Every request is signed with
// the secret key; the key is used only inside the signature and never sent or logged.
import 'server-only';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { toMinorUnits } from '@/lib/payment/adapters/base';
import { parseJson, sendHttp } from '@/lib/payment/http-client';
import type { Money } from '@/lib/utils/currency';
import type { AdapterContext } from '@/types/contracts';

export type Json = Record<string, unknown>;
export const obj = (v: unknown): Json | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export const PAYMENT_ID = /^payment_[a-f0-9]{16,64}$/;
export const CHECKOUT_ID = /^checkout_[a-f0-9]{16,64}$/;

export function apiBase(environment: 'sandbox' | 'live'): string {
  return environment === 'live' ? 'https://api.rapyd.net' : 'https://sandboxapi.rapyd.net';
}

/** Scripts and checkout hosts (docs section 3). */
export const TOOLKIT_URLS: Readonly<Record<'sandbox' | 'live', string>> = {
  sandbox: 'https://sandboxcheckouttoolkit.rapyd.net',
  live: 'https://checkouttoolkit.rapyd.net',
};

/** The shortest decimal text of an amount (`120.5`, `120`), printed from cents without any floating point step. */
export function amountText(amount: Money): string {
  const cents = toMinorUnits(amount).padStart(3, '0');
  const whole = cents.slice(0, -2);
  const fraction = cents.slice(-2).replace(/0+$/, '');
  return fraction === '' ? whole : `${whole}.${fraction}`;
}

const MARK = '__kd_amount_';
export interface AmountSlot {
  readonly slot: Money;
}
export const amountSlot = (slot: Money): AmountSlot => ({ slot });
const isMoney = (value: unknown): value is Money =>
  typeof value === 'object' && value !== null && 'toDbString' in value;

/** JSON text of `payload` (no whitespace) where every `amountSlot` leaf is a bare number. */
export function jsonWithAmounts(payload: unknown): string {
  const amounts: Money[] = [];
  const text = JSON.stringify(payload, (_key, value: unknown) => {
    const found = obj(value);
    if (found && Object.keys(found).length === 1 && 'slot' in found && isMoney(found.slot)) {
      amounts.push(found.slot);
      return `${MARK}${amounts.length - 1}__`;
    }
    return value;
  });
  return amounts.reduce(
    (acc, amount, index) => acc.replace(`"${MARK}${index}__"`, amountText(amount)),
    text,
  );
}

/** Base64 of the hexadecimal text of the HMAC (docs section 2). */
export function sign(parts: readonly string[], secretKey: string): string {
  const hex = createHmac('sha256', secretKey).update(parts.join(''), 'utf8').digest('hex');
  return Buffer.from(hex, 'utf8').toString('base64');
}

export interface ApiResult {
  httpStatus: number;
  ok: boolean;
  errorCode: string | null;
  data: Json | null;
}

function keys(ctx: AdapterContext): { access: string; secret: string } {
  const access = ctx.credentials.accessKey ?? '';
  const secret = ctx.credentials.secretKey ?? '';
  if (access === '' || secret === '') throw new ValidationError('The Rapyd keys are missing.');
  return { access, secret };
}

/** An `idempotency` value from the platform's key: fixed length, only hexadecimal characters. */
export function idempotencyValue(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 40);
}

export async function rapydCall(
  ctx: AdapterContext,
  method: 'get' | 'post',
  path: string,
  bodyText: string | null,
  idempotencyKey: string | null = null,
): Promise<ApiResult> {
  const { access, secret } = keys(ctx);
  const salt = randomBytes(8).toString('hex');
  const timestamp = String(Date.now()).slice(0, -3);
  const body = bodyText ?? '';
  const signature = sign([method, path, salt, timestamp, access, secret, body], secret);
  const response = await sendHttp({
    method: method === 'get' ? 'GET' : 'POST',
    url: `${apiBase(ctx.environment)}${path}`,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      access_key: access,
      salt,
      timestamp,
      signature,
      ...(idempotencyKey ? { idempotency: idempotencyValue(idempotencyKey) } : {}),
    },
    ...(method === 'post' ? { body } : {}),
  });
  if (response.status >= 500 || response.status === 429)
    throw new Error(`rapyd unavailable (${response.status})`);
  const parsed = parseJson(response.text) ?? {};
  const status = obj(parsed.status);
  const errorCode = str(status?.error_code);
  if (response.status === 401 || response.status === 403)
    throw new ValidationError(
      'Rapyd did not accept the keys for this environment (check the keys, the environment and the server clock).',
    );
  return {
    httpStatus: response.status,
    ok: str(status?.status) === 'SUCCESS',
    errorCode,
    data: obj(parsed.data),
  };
}
