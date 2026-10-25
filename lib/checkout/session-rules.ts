// path: lib/checkout/session-rules.ts
// Hosted checkout sessions as pure rules: the input a merchant's store sends, the state of a session and the answer shape.
// No database here. Money stays decimal text; JavaScript numbers are never used for an amount.
import { z } from 'zod';
import { Money } from '@/lib/utils/currency';

export const SESSION_DEFAULT_VALID_HOURS = 24;
export const SESSION_MAX_VALID_HOURS = 168;
/** A claim that never finished (a crash between claim and link) can be taken over after this long. */
export const CLAIM_STALE_SECONDS = 120;
export const MAX_AMOUNT = '99999999.99';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v) && !/[\u0000-\u001f]/.test(v), {
      message: 'This text has characters that are not allowed.',
    });

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => {
      try {
        const u = new URL(v);
        return (
          u.protocol === 'https:' &&
          u.username === '' &&
          u.password === '' &&
          u.hostname.includes('.')
        );
      } catch {
        return false;
      }
    },
    { message: 'Use a full https:// address.' },
  );

export const sessionInput = z
  .object({
    order_id: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._:#/-]{0,99}$/,
        'The order id has 1 to 100 letters, digits or . _ : # / -',
      ),
    amount: z
      .string()
      .trim()
      .regex(
        /^\d{1,8}\.\d{1,2}$|^\d{1,8}$/,
        'The amount is a decimal text with at most two decimals, for example "49.90".',
      )
      .refine((v) => Money.parse(v).gt('0') && Money.parse(v).lte(MAX_AMOUNT), {
        message: 'The amount must be above zero.',
      }),
    currency: z.literal('USD').default('USD'),
    customer: z
      .object({
        name: plain(1, 200),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .max(254)
          .regex(/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]{2,}$/, 'Enter a valid e-mail address.'),
        country: z.string().regex(/^[A-Z]{2}$/, 'Use a two-letter country code such as US.'),
        postal_code: plain(1, 20).optional(),
      })
      .strict(),
    description: plain(0, 500).optional(),
    success_url: httpsUrl,
    cancel_url: httpsUrl,
    expires_in_hours: z.number().int().min(1).max(SESSION_MAX_VALID_HOURS).optional(),
    metadata: z
      .record(plain(1, 40), plain(0, 200))
      .refine((v) => Object.keys(v).length <= 20, { message: 'At most 20 metadata entries.' })
      .optional(),
  })
  .strict();
export type SessionInput = z.infer<typeof sessionInput>;

export const sessionParams = z.object({ id: z.string().uuid() }).strict();

export type SessionStatus = 'creating' | 'open' | 'paid' | 'cancelled' | 'expired';

/** What the store sees. "creating" is internal: the store is told to ask again shortly. */
export interface SessionAnswer {
  id: string;
  order_id: string;
  status: Exclude<SessionStatus, 'creating'>;
  amount: string;
  currency: 'USD';
  checkout_url: string | null;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
}

/** The status the store should see now: an open session past its time is expired. */
export function effectiveStatus(
  status: SessionStatus,
  expiresAt: string | null,
  now: Date,
): SessionStatus {
  if (status === 'open' && expiresAt !== null && new Date(expiresAt).getTime() <= now.getTime())
    return 'expired';
  return status;
}

export function claimIsStale(updatedAt: string, now: Date): boolean {
  return now.getTime() - new Date(updatedAt).getTime() > CLAIM_STALE_SECONDS * 1000;
}

/** Same order, same data: asking again is a replay. A different amount for the same order is a mistake of the store. */
export function sameOrder(
  existing: { amount: string; customer_email: string },
  input: SessionInput,
): boolean {
  return (
    Money.parse(existing.amount).eq(Money.parse(input.amount)) &&
    existing.customer_email === input.customer.email
  );
}

/** The address the buyer is sent back to, with the order and the result added. Never follows a redirect of its own. */
export function returnUrl(
  base: string,
  sessionId: string,
  orderId: string,
  result: 'paid' | 'cancelled',
): string {
  const url = new URL(base);
  url.searchParams.set('kd_session', sessionId);
  url.searchParams.set('kd_order', orderId);
  url.searchParams.set('kd_result', result);
  return url.toString();
}

export const sessionOut = z
  .object({
    id: z.string().uuid(),
    order_id: z.string(),
    status: z.enum(['open', 'paid', 'cancelled', 'expired']),
    amount: z.string(),
    currency: z.literal('USD'),
    checkout_url: z.string().nullable(),
    expires_at: z.string().nullable(),
    paid_at: z.string().nullable(),
    created_at: z.string(),
  })
  .strict();
