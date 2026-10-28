// path: lib/payment/adapters/nmi/shared-server.ts
// The one server module both NMI front-end modes use (REQ-NMI-MODES, docs/processors/nmi.md sections 2, 3, 5 and 10).
// Whatever mode prepared the token (Collect.js or the Payment Component), the payment is sent from here to the NMI REST
// API (v5) with the private security key in the Authorization header. The key never leaves this file and is never logged.
import 'server-only';
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

/** An address NMI may answer from: https, a host of nmi.com or networkmerchants.com, path "/api" only. */
export const LIVE_API_BASE = /^https:\/\/[a-z0-9.-]{1,60}\.(nmi|networkmerchants)\.com\/api$/;

/**
 * The sandbox address of the REST API is documented. NMI's pages do not state the production address (blocker B2 of
 * STEP 12), so for a live account the owner enters the address NMI gave them in the credential `liveApiBase`; without it a
 * live account is refused before any call.
 */
export function apiBase(
  environment: 'sandbox' | 'live',
  credentials: Readonly<Record<string, string>>,
): string {
  if (environment === 'sandbox') return 'https://sandbox.nmi.com/api';
  const given = (credentials.liveApiBase ?? '').trim().replace(/\/+$/, '');
  if (!LIVE_API_BASE.test(given))
    throw new ValidationError(
      'Enter the live REST API address that NMI gave you (the "Live API address" field) before using a live account.',
    );
  return given;
}

/** Collect.js is loaded from this one address in both environments (docs.nmi.com, Collect.js quick start). */
export const COLLECTJS_SCRIPT_URL = 'https://secure.nmi.com/token/Collect.js';

/** Browser script of the Payment Component mode (sandbox only; the production address is not documented). */
export const NMI_SCRIPT_URLS: Readonly<Record<'sandbox' | 'live', string | null>> = {
  sandbox: 'https://sandbox.nmi.com/js/v1/Gateway.js',
  live: null,
};

/** Money as the `x.xx` number the API expects, printed from cents without any floating point step. */
export function decimalText(amount: Money): string {
  const cents = toMinorUnits(amount).padStart(3, '0');
  return `${cents.slice(0, -2)}.${cents.slice(-2)}`;
}

const AMOUNT_MARK = '__kd_amount__';

/**
 * JSON text of `payload` where each field listed in `amounts` is a bare number such as 120.50 (a JSON string would be
 * refused: the schema says number). The text of an amount comes from `decimalText`, so it is always digits and a dot.
 */
export function jsonWithAmounts(payload: Json, amounts: Readonly<Record<string, Money>>): string {
  const marked: Json = { ...payload };
  const order: string[] = [];
  for (const key of Object.keys(amounts)) {
    marked[key] = `${AMOUNT_MARK}${key}`;
    order.push(key);
  }
  let text = JSON.stringify(marked);
  for (const key of order) {
    const amount = amounts[key];
    if (amount) text = text.replace(`"${AMOUNT_MARK}${key}"`, decimalText(amount));
  }
  return text;
}

export interface ApiResult {
  status: number;
  body: Json;
}

function privateKey(ctx: AdapterContext): string {
  const key = ctx.credentials.privateKey ?? '';
  if (key === '') throw new ValidationError('The NMI private security key is missing.');
  return key;
}

export async function nmiCall(
  ctx: AdapterContext,
  method: 'GET' | 'POST',
  path: string,
  bodyText: string | null,
): Promise<ApiResult> {
  const response = await sendHttp({
    method,
    url: `${apiBase(ctx.environment, ctx.credentials)}${path}`,
    headers: {
      authorization: privateKey(ctx),
      accept: 'application/json',
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    },
    ...(method === 'POST' ? { body: bodyText ?? '{}' } : {}),
  });
  if (response.status >= 500 || response.status === 429) {
    throw new Error(`nmi unavailable (${response.status})`);
  }
  if (response.status === 401) {
    throw new ValidationError(
      'NMI did not accept the private security key for this environment (check the key and its permissions).',
    );
  }
  return { status: response.status, body: parseJson(response.text) ?? {} };
}

/** Payment endpoints (docs section 5). Each takes the JSON text built by the caller. */
export const paymentPath = (id: string): string => `/v5/payments/${encodeURIComponent(id)}`;
export const salePath = '/v5/payments/sale';
export const authPath = '/v5/payments/auth';
