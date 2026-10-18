// path: lib/payment/adapters/payproglobal/api.ts
// PayPro Global REST calls and checkout link encryption (docs/processors/payproglobal.md sections 2, 4 and 5). Every
// call is a JSON POST whose body carries the vendor account id and the API secret key. The key never leaves this file
// and is never logged.
import 'server-only';
import { createCipheriv } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { toMinorUnits } from '@/lib/payment/adapters/base';
import { parseJson, sendHttp } from '@/lib/payment/http-client';
import type { Money } from '@/lib/utils/currency';
import type { AdapterContext } from '@/types/contracts';

export type Json = Record<string, unknown>;
export const obj = (v: unknown): Json | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
export const list = (v: unknown): Json[] =>
  Array.isArray(v) ? v.map(obj).filter((x): x is Json => x !== null) : [];

export const STORE_BASE = 'https://store.payproglobal.com';
export const ORDER_ID = /^\d{1,12}$/;

/** Money as the `x.xx` number the API expects, printed from cents without any floating point step. */
export function decimalText(amount: Money): string {
  const cents = toMinorUnits(amount).padStart(3, '0');
  return `${cents.slice(0, -2)}.${cents.slice(-2)}`;
}

const MARK = '__kd_amount_';
export interface AmountSlot {
  readonly slot: Money;
}
export const amountSlot = (slot: Money): AmountSlot => ({ slot });

function isMoney(value: unknown): value is Money {
  return typeof value === 'object' && value !== null && 'toDbString' in value;
}

/** JSON text of `payload` where every `amountSlot` leaf is a bare number such as 120.50. */
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

export interface ApiResult {
  status: number;
  /** `response` member of an answer (an object or the first element of a list answer). */
  data: Json | null;
  items: Json[];
  ok: boolean;
}

export async function payproCall(
  ctx: AdapterContext,
  path: string,
  payload: Json,
): Promise<ApiResult> {
  const account = ctx.credentials.vendorAccountId ?? '';
  const secret = ctx.credentials.apiSecretKey ?? '';
  if (!/^\d{1,12}$/.test(account) || secret === '')
    throw new ValidationError('The PayPro Global account id or API secret key is missing.');
  const response = await sendHttp({
    method: 'POST',
    url: `${STORE_BASE}/api/${path}`,
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: jsonWithAmounts({
      ...payload,
      vendorAccountId: wholeNumber(account),
      apiSecretKey: secret,
    }),
  });
  if (response.status >= 500 || response.status === 429)
    throw new Error(`payproglobal unavailable (${response.status})`);
  if (response.status === 401 || response.status === 403)
    throw new ValidationError(
      'PayPro Global refused the request (check the credentials and that the platform server address is whitelisted).',
    );
  const body = parseJson(response.text) ?? {};
  const inner = body.response;
  return {
    status: response.status,
    data: obj(inner),
    items: Array.isArray(inner) ? list(inner) : [],
    ok: body.isSuccess === true,
  };
}

/** The account id as a JSON integer, read from digits (never through a float step). */
function wholeNumber(digits: string): number {
  return +digits;
}

export interface DynamicSettings {
  invoiceId: string;
  amount: Money;
  expiresAtIso: string;
}

/** The dynamic settings query string of a checkout link (docs section 4). */
export function dynamicSettingsText(settings: DynamicSettings): string {
  return [
    `x-KdInvoice=${encodeURIComponent(settings.invoiceId)}`,
    `Name=${encodeURIComponent('Invoice payment')}`,
    `Price[USD][Amount]=${decimalText(settings.amount)}`,
    `LinkExpiration=${settings.expiresAtIso.slice(0, 19)}`,
  ].join('&');
}

/** AES-256-CBC, PKCS7, key and IV as ASCII text, URL-safe Base64 (docs section 4). */
export function encryptDynamic(plain: string, key: string, iv: string): string {
  if (key.length !== 32 || iv.length !== 16)
    throw new ValidationError('The PayPro Global encryption key or IV has the wrong length.');
  const cipher = createCipheriv('aes-256-cbc', Buffer.from(key, 'ascii'), Buffer.from(iv, 'ascii'));
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return encrypted.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}
