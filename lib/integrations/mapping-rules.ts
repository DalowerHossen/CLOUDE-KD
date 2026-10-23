// path: lib/integrations/mapping-rules.ts
// Store orders as pure functions: the inputs of a connection, the signature checks of the two stores, reading a Shopify or
// WooCommerce order into one shape, the conflicts that shape can have (another currency, a SKU that is not mapped, no e-mail, no billing address),
// the retry delay, and the steps of the sync mode. No database or network here. Facts: docs/integrations/shopify.md and
// docs/integrations/woocommerce.md.
import { z } from 'zod';
import {
  CONFLICT_KINDS,
  MAX_ORDER_LINES,
  ORDER_CURRENCY,
  ORDER_RETRY_MINUTES,
  SHOPIFY_DOMAIN_SUFFIX,
  SYNC_MODES,
  type ConflictKind,
  type SyncMode,
} from '@/config/s16-commerce';
import { bytesToHex, hmacSha256Bytes, timingSafeEqualStrings } from '@/lib/utils/hash';
import { Money } from '@/lib/utils/currency';

const noAngle = (v: string): boolean => !/[<>]/.test(v);
const name = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(noAngle, { message: 'Angle brackets are not allowed.' });

/* ---------- addresses ---------- */

/** The myshopify.com domain of a store from what a person types (with or without https:// and a trailing slash). */
export function normaliseShopDomain(input: string): string | null {
  const text = input
    .trim()
    .toLowerCase()
    .replace(/^https:\/\//, '')
    .replace(/\/+$/, '');
  if (!/^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(text)) return null;
  return text.endsWith(SHOPIFY_DOMAIN_SUFFIX) ? text : null;
}

/** The https origin of a WooCommerce site (a path such as /shop is kept out). */
export function normaliseStoreUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return null;
  if (!url.hostname.includes('.') || url.port !== '') return null;
  return url.origin.toLowerCase();
}

/* ---------- inputs ---------- */

const syncMode = z.enum(SYNC_MODES);

export const shopifyConnect = z
  .object({
    provider: z.literal('shopify'),
    name,
    shopDomain: z
      .string()
      .trim()
      .max(200)
      .refine((v) => normaliseShopDomain(v) !== null, {
        message: 'Use the store address that ends in .myshopify.com.',
      }),
    accessToken: z.string().trim().min(20).max(300).regex(/^\S+$/, 'It must not contain spaces.'),
    clientSecret: z.string().trim().min(16).max(300).regex(/^\S+$/, 'It must not contain spaces.'),
    syncMode: syncMode.default('realtime'),
  })
  .strict();

export const woocommerceConnect = z
  .object({
    provider: z.literal('woocommerce'),
    name,
    storeUrl: z
      .string()
      .trim()
      .max(200)
      .refine((v) => normaliseStoreUrl(v) !== null, {
        message: 'Use the https address of the store.',
      }),
    consumerKey: z
      .string()
      .trim()
      .regex(/^ck_[0-9A-Za-z]{20,80}$/, 'The consumer key starts with ck_.'),
    consumerSecret: z
      .string()
      .trim()
      .regex(/^cs_[0-9A-Za-z]{20,80}$/, 'The consumer secret starts with cs_.'),
    syncMode: syncMode.default('realtime'),
  })
  .strict();

export const connectInput = z.discriminatedUnion('provider', [shopifyConnect, woocommerceConnect]);

export const connectionUpdate = z
  .object({
    version: z.number().int().min(1),
    name: name.optional(),
    status: z.enum(['active', 'paused']).optional(),
    syncMode: syncMode.optional(),
    autoClient: z.boolean().optional(),
    accessToken: z.string().trim().min(20).max(300).regex(/^\S+$/).optional(),
    clientSecret: z.string().trim().min(16).max(300).regex(/^\S+$/).optional(),
    consumerKey: z
      .string()
      .trim()
      .regex(/^ck_[0-9A-Za-z]{20,80}$/)
      .optional(),
    consumerSecret: z
      .string()
      .trim()
      .regex(/^cs_[0-9A-Za-z]{20,80}$/)
      .optional(),
  })
  .strict();

export const mappingInput = z
  .object({
    externalSku: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine(noAngle, { message: 'Angle brackets are not allowed.' }),
    productId: z.string().uuid(),
  })
  .strict();

export const conflictResolution = z
  .object({
    resolution: z.enum(['resolved', 'ignored']),
    note: z
      .string()
      .trim()
      .max(300)
      .refine(noAngle, { message: 'Angle brackets are not allowed.' })
      .default(''),
  })
  .strict();

/* ---------- signatures ---------- */

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/**
 * The signature of a Shopify delivery: the base64 HMAC-SHA256 of the raw body with the client secret of the app, sent in
 * X-Shopify-Hmac-Sha256. Compared in constant time.
 */
export async function verifyShopifySignature(
  clientSecret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (header === null || header === '') return false;
  const expected = b64(await hmacSha256Bytes(clientSecret, rawBody));
  return timingSafeEqualStrings(expected, header.trim());
}

/** The signature of a WooCommerce delivery: the base64 HMAC-SHA256 of the raw body with the webhook secret, in X-WC-Webhook-Signature. */
export async function verifyWooSignature(
  secret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (header === null || header === '') return false;
  const expected = b64(await hmacSha256Bytes(secret, rawBody));
  return timingSafeEqualStrings(expected, header.trim());
}

/** The signature the platform expects, in hex (for the checks). */
export const signatureHex = async (secret: string, body: string): Promise<string> =>
  bytesToHex(await hmacSha256Bytes(secret, body));

/* ---------- orders ---------- */

export interface NormalizedLine {
  externalId: string;
  sku: string | null;
  title: string;
  quantity: number;
  unitPrice: string;
}

export interface NormalizedOrder {
  externalId: string;
  number: string | null;
  email: string | null;
  customerName: string | null;
  customerExternalId: string | null;
  currency: string | null;
  total: string | null;
  orderedAt: string | null;
  cancelled: boolean;
  lines: NormalizedLine[];
  billing: {
    line1: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  } | null;
}

const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, max = 200): string | null => {
  const s = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
  const t = s.replace(/[<>]/g, '').trim();
  return t === '' ? null : t.slice(0, max);
};
const idText = (v: unknown): string | null => {
  const s =
    typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : typeof v === 'string' ? v : '';
  return /^[0-9A-Za-z_:/.-]{1,64}$/.test(s) ? s : null;
};
const emailText = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s) ? s : null;
};
/** A decimal amount as text with at most four places; null when it is not a plain amount. */
export function amountText(v: unknown): string | null {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^\d{1,14}(\.\d+)?$/.test(s)) return null;
  try {
    return Money.parseRounded(s).toString();
  } catch {
    return null;
  }
}
const instant = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v : '';
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
const quantity = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : null;
};

function linesOf(
  raw: unknown[],
  unitPrice: (l: Record<string, unknown>) => unknown,
): NormalizedLine[] | null {
  if (raw.length === 0 || raw.length > MAX_ORDER_LINES) return null;
  const out: NormalizedLine[] = [];
  for (const entry of raw) {
    const l = obj(entry);
    const id = idText(l.id);
    const q = quantity(l.quantity);
    const price = amountText(unitPrice(l));
    if (id === null || q === null || price === null) return null;
    out.push({
      externalId: id,
      sku: text(l.sku, 120),
      title: text(l.title ?? l.name, 200) ?? 'Item',
      quantity: q,
      unitPrice: price,
    });
  }
  return out;
}

/** Reads the payload of Shopify's orders/create and orders/updated. Null when it is not an order we can use. */
export function normalizeShopifyOrder(json: unknown): NormalizedOrder | null {
  const o = obj(json);
  const id = idText(o.id);
  const lines = linesOf(arr(o.line_items), (l) => l.price);
  if (id === null || lines === null) return null;
  const c = obj(o.customer);
  const b = obj(o.billing_address);
  const first = text(c.first_name, 80);
  const last = text(c.last_name, 80);
  const person = [first, last].filter((x) => x !== null).join(' ');
  return {
    externalId: id,
    number: text(o.name, 64),
    email: emailText(o.email) ?? emailText(c.email),
    customerName: person !== '' ? person : text(b.name, 200),
    customerExternalId: idText(c.id),
    currency:
      typeof o.currency === 'string' && /^[A-Za-z]{3}$/.test(o.currency)
        ? o.currency.toUpperCase()
        : null,
    total: amountText(o.total_price),
    orderedAt: instant(o.created_at),
    cancelled: typeof o.cancelled_at === 'string' && o.cancelled_at !== '',
    lines,
    billing: billingOf(b, 'address1', 'province', 'zip', 'country_code'),
  };
}

/** Reads the payload of WooCommerce's order.created and order.updated (the same shape as the REST API order). */
export function normalizeWooOrder(json: unknown): NormalizedOrder | null {
  const o = obj(json);
  const id = idText(o.id);
  const lines = linesOf(arr(o.line_items), (l) => l.price);
  if (id === null || lines === null) return null;
  const b = obj(o.billing);
  const first = text(b.first_name, 80);
  const last = text(b.last_name, 80);
  const person = [first, last].filter((x) => x !== null).join(' ');
  const status = typeof o.status === 'string' ? o.status : '';
  return {
    externalId: id,
    number: text(o.number, 64),
    email: emailText(b.email),
    customerName: person !== '' ? person : text(b.company, 200),
    customerExternalId: idText(o.customer_id) === '0' ? null : idText(o.customer_id),
    currency:
      typeof o.currency === 'string' && /^[A-Za-z]{3}$/.test(o.currency)
        ? o.currency.toUpperCase()
        : null,
    total: amountText(o.total),
    orderedAt: instant(
      o.date_created_gmt === undefined ? o.date_created : `${String(o.date_created_gmt)}Z`,
    ),
    cancelled: status === 'cancelled' || status === 'failed' || status === 'trash',
    lines,
    billing: billingOf(b, 'address_1', 'state', 'postcode', 'country'),
  };
}

function billingOf(
  b: Record<string, unknown>,
  line1: string,
  region: string,
  postal: string,
  country: string,
): NormalizedOrder['billing'] {
  const l1 = text(b[line1], 200);
  const city = text(b.city, 100);
  const code = text(b[country], 2);
  if (l1 === null || city === null || code === null) return null;
  return {
    line1: l1,
    city,
    region: text(b[region], 100) ?? '',
    postalCode: text(b[postal], 20) ?? '',
    country: code.toUpperCase(),
  };
}

/** The id of the order a Shopify refunds/create payload belongs to, and the refund id. */
export function readShopifyRefund(json: unknown): { refundId: string; orderId: string } | null {
  const r = obj(json);
  const refundId = idText(r.id);
  const orderId = idText(r.order_id);
  return refundId !== null && orderId !== null ? { refundId, orderId } : null;
}

/* ---------- conflicts ---------- */

export interface FoundConflict {
  kind: ConflictKind;
  detail: string;
}

/** What stops an order from being turned into a client and an invoice without a person. */
export function conflictsOf(order: NormalizedOrder, mapped: ReadonlySet<string>): FoundConflict[] {
  const out: FoundConflict[] = [];
  if (order.currency !== null && order.currency !== ORDER_CURRENCY)
    out.push({
      kind: 'currency',
      detail: `The order is in ${order.currency}; the platform keeps ${ORDER_CURRENCY} only.`,
    });
  if (order.email === null)
    out.push({ kind: 'no_email', detail: 'The order has no valid e-mail address for the client.' });
  if (order.billing === null || order.billing.postalCode === '')
    out.push({
      kind: 'no_address',
      detail:
        'The order has no billing address (street, city, postal code and country) that a client needs.',
    });
  const seen = new Set<string>();
  for (const line of order.lines) {
    const key = line.sku === null ? null : line.sku.toLowerCase();
    if (key === null) {
      const detail = `No SKU on "${line.title}".`.slice(0, 300);
      if (!seen.has(detail)) out.push({ kind: 'unmapped_sku', detail });
      seen.add(detail);
    } else if (!mapped.has(key) && !seen.has(key)) {
      out.push({
        kind: 'unmapped_sku',
        detail: `SKU ${line.sku ?? ''} is not mapped to a product.`.slice(0, 300),
      });
      seen.add(key);
    }
  }
  return out;
}

/** The SKUs of an order in lower case (for the mapping lookup). */
export const skusOf = (order: NormalizedOrder): string[] => [
  ...new Set(order.lines.flatMap((l) => (l.sku === null ? [] : [l.sku.toLowerCase()]))),
];

/** The client name for an order: the customer, else the e-mail. */
export const clientNameOf = (order: NormalizedOrder): string =>
  order.customerName ?? order.email ?? 'Store customer';

/* ---------- retry and sync mode ---------- */

/** When to try an order again after its n-th failure (1 based); null when the tries are used up. */
export function retryAt(failures: number, now: Date, maxAttempts: number): Date | null {
  if (failures >= maxAttempts) return null;
  const minutes = ORDER_RETRY_MINUTES[Math.min(failures, ORDER_RETRY_MINUTES.length) - 1];
  return new Date(now.getTime() + (minutes ?? 720) * 60_000);
}

/** The earliest time an order that arrived by webhook is handled: at once, at the next full hour, or at the next midnight (UTC). */
export function handleAfter(mode: SyncMode, now: Date): Date {
  if (mode === 'realtime') return now;
  const t = new Date(now);
  t.setUTCMinutes(0, 0, 0);
  if (mode === 'hourly') return new Date(t.getTime() + 3_600_000);
  t.setUTCHours(0);
  return new Date(t.getTime() + 86_400_000);
}

export { CONFLICT_KINDS };
