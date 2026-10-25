// path: lib/payment/card-search-rules.ts
// Finding a payment by the last four digits of the card: the input, the default time window and the shape of a result. Pure.
// Four digits match many cards, so a search always has a time window and a limit; support staff must also give a reason.
import { z } from 'zod';
import { Money } from '@/lib/utils/currency';

export const DEFAULT_WINDOW_DAYS = 90;
export const MAX_WINDOW_DAYS = 366;
export const MAX_RESULTS = 50;
export const DEFAULT_RESULTS = 25;
export const SEARCH_STEP_UP_SECONDS = 300;

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), { message: 'Enter a date.' });
const amount = z
  .string()
  .trim()
  .regex(/^\d{1,12}\.\d{1,4}$|^\d{1,12}$/, 'Use a decimal text such as 49.90.');

const base = {
  last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Enter exactly four digits.'),
  brand: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9 _-]{1,20}$/)
    .optional(),
  from: day.optional(),
  to: day.optional(),
  amountMin: amount.optional(),
  amountMax: amount.optional(),
  limit: z.number().int().min(1).max(MAX_RESULTS).default(DEFAULT_RESULTS),
};

const windowOk = (v: {
  from?: string;
  to?: string;
  amountMin?: string;
  amountMax?: string;
}): boolean => {
  const { from, to } = resolveWindow(v, new Date());
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days < 0 || days > MAX_WINDOW_DAYS) return false;
  if (v.amountMin && v.amountMax) return Money.parse(v.amountMin).lte(Money.parse(v.amountMax));
  return true;
};
const windowMessage = {
  message: `The dates must be in order and at most ${MAX_WINDOW_DAYS} days apart; the smallest amount cannot be above the largest.`,
};

/** An owner searches the payments of the owner's own company. */
export const tenantSearchInput = z.object(base).strict().refine(windowOk, windowMessage);

/** Platform staff search all companies, or one; a reason is always needed and is written to the audit log. */
export const platformSearchInput = z
  .object({
    ...base,
    companyId: z.string().uuid().optional(),
    reason: z
      .string()
      .trim()
      .min(10, 'Say why you are looking (at least 10 characters).')
      .max(300)
      .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' }),
  })
  .strict()
  .refine(windowOk, windowMessage);

export type TenantSearchInput = z.infer<typeof tenantSearchInput>;
export type PlatformSearchInput = z.infer<typeof platformSearchInput>;

/** The window of dates to look in: the given dates, else the last 90 days ending today. */
export function resolveWindow(
  v: { from?: string; to?: string },
  now: Date,
): { from: string; to: string } {
  const today = now.toISOString().slice(0, 10);
  const to = v.to ?? today;
  const from =
    v.from ??
    new Date(Date.parse(`${to}T00:00:00Z`) - DEFAULT_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
  return { from, to };
}

export interface CardSearchRow {
  paymentId: string;
  at: string;
  amount: string;
  status: string;
  card: { brand: string | null; last4: string };
  merchant: { companyId: string; name: string; website: string | null; store: string | null };
  invoiceNumber: string | null;
  payer: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    country: string | null;
  };
}

/** One line for an address block of an invoice, without empty parts. */
export function addressLine(bill: Record<string, unknown>): string | null {
  const text = (k: string): string => (typeof bill[k] === 'string' ? String(bill[k]).trim() : '');
  const parts = [
    text('line1'),
    text('line2'),
    text('city'),
    text('region'),
    text('postalCode'),
    text('country'),
  ].filter((p) => p !== '');
  return parts.length > 0 ? parts.join(', ') : null;
}

/** The host of a store address ("shop.example"), for display; null when it is not a web address. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
