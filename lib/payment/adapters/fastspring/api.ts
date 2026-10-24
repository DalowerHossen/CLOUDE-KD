// path: lib/payment/adapters/fastspring/api.ts
// FastSpring REST calls (docs/processors/fastspring.md sections 2, 3, 5 and 10). HTTP Basic with the API username and
// password; JSON. The password never leaves this file and is never logged.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { toMinorUnits } from '@/lib/payment/adapters/base';
import { basicAuth, sendHttp } from '@/lib/payment/http-client';
import type { Money } from '@/lib/utils/currency';
import type { AdapterContext } from '@/types/contracts';

export type Json = Record<string, unknown>;
export const obj = (v: unknown): Json | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
export const list = (v: unknown): Json[] =>
  Array.isArray(v) ? v.map(obj).filter((x): x is Json => x !== null) : [];

export const API_BASE = 'https://api.fastspring.com';
export const SDK_URL = 'https://cdn.onfastspring.com/checkout-sdk/latest/fastspring-sdk.js';

/** Money as the `x.xx` number the API expects, printed from cents without any floating point step. */
export function decimalText(amount: Money): string {
  const cents = toMinorUnits(amount).padStart(3, '0');
  return `${cents.slice(0, -2)}.${cents.slice(-2)}`;
}

const MARK = '__kd_amount_';

/**
 * JSON text of `payload` where every `{ [AMOUNT]: Money }` leaf is a bare number such as 120.50. Amounts are put in the
 * payload as `Amount` objects (`amountSlot`), found while serializing, and replaced by their decimal text.
 */
export interface AmountSlot {
  readonly slot: Money;
}
export const amountSlot = (slot: Money): AmountSlot => ({ slot });

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
    (acc, amount, index) => acc.replace(`"${MARK}${index}__"`, decimalText(amount)),
    text,
  );
}

function isMoney(value: unknown): value is Money {
  return typeof value === 'object' && value !== null && 'toDbString' in value;
}

export interface ApiResult {
  status: number;
  body: Json;
}

function authorization(ctx: AdapterContext): string {
  const user = ctx.credentials.username ?? '';
  const password = ctx.credentials.password ?? '';
  if (user === '' || password === '')
    throw new ValidationError('The FastSpring API username or password is missing.');
  return basicAuth(user, password);
}

export async function fastspringCall(
  ctx: AdapterContext,
  method: 'GET' | 'POST',
  path: string,
  bodyText: string | null,
): Promise<ApiResult> {
  const response = await sendHttp({
    method,
    url: `${API_BASE}${path}`,
    headers: {
      authorization: authorization(ctx),
      accept: 'application/json',
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    },
    ...(method === 'POST' ? { body: bodyText ?? '{}' } : {}),
  });
  if (response.status >= 500 || response.status === 429)
    throw new Error(`fastspring unavailable (${response.status})`);
  if (response.status === 401 || response.status === 403)
    throw new ValidationError(
      'FastSpring did not accept the API credentials (check the username, the password and the store).',
    );
  let body: Json = {};
  if (response.text.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(response.text);
      const single = obj(parsed);
      const first = Array.isArray(parsed) ? obj(parsed[0]) : null;
      body = single ?? first ?? {};
    } catch {
      body = {};
    }
  }
  return { status: response.status, body };
}

/** Matches `store-id/checkout-id`. */
export const CHECKOUT_PATH = /^[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,100}$/;
export const CHECKOUT_URL = /^https:\/\/[a-z0-9-]{1,100}\.onfastspring\.com\/[A-Za-z0-9_-]{1,100}$/;
export const PRODUCT_PATH = /^[A-Za-z0-9_-]{1,256}$/;
export const ORDER_ID = /^[A-Za-z0-9_-]{8,64}$/;
