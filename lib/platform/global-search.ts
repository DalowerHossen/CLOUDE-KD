// path: lib/platform/global-search.ts
// Rules of the platform search across all companies: the shortest and longest text, and the clean-up that makes a text safe
// to put into a pattern filter. Safe to import in the browser.
import { z } from 'zod';

export const MIN_SEARCH = 3;
export const MAX_SEARCH = 80;
export const PER_KIND = 10;

export const searchQuery = z
  .object({
    q: z
      .string()
      .trim()
      .min(MIN_SEARCH)
      .max(MAX_SEARCH)
      .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' }),
  })
  .strict();

/** Removes the characters that act as wildcards or separators in a filter, so a search text can only match itself. */
export function patternSafe(q: string): string {
  return q
    .replace(/[%_,()\\*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type HitKind = 'company' | 'user' | 'client' | 'invoice' | 'payment' | 'ticket';

export interface Hit {
  kind: HitKind;
  id: string;
  title: string;
  detail: string;
  href: string | null;
  companyId: string | null;
  companyName: string;
}

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The filter for a payment: its id when the text is one, else the processor's transaction id or the trace id. */
export function paymentFilter(text: string): string {
  const t = patternSafe(text);
  return UUID_TEXT.test(t)
    ? `id.eq.${t},processor_transaction_id.ilike.%${t}%`
    : `processor_transaction_id.ilike.%${t}%,correlation_id.ilike.%${t}%`;
}
