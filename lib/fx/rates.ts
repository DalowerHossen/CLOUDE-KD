// path: lib/fx/rates.ts
// Display-currency conversion. Stored amounts are always US dollars; a converted amount is only shown next to them.
// Pure. Safe to import in the browser.
import { z } from 'zod';
import { DISPLAY_CURRENCIES } from '@/lib/company/sections';
import { roundMoney } from '@/lib/invoice/rounding';
import { type Money } from '@/lib/utils/currency';

export const FX_CURRENCIES = DISPLAY_CURRENCIES.filter((c) => c !== 'USD');

/** Places shown for each currency (currencies without minor units show none). */
const MINOR: Record<string, true> = { JPY: true, VND: true, IDR: true };

const RATE_TEXT = /^\d{1,12}(\.\d{1,8})?$/;

export const fxRateInput = z
  .object({
    currency: z.enum(FX_CURRENCIES as unknown as [string, ...string[]]),
    rate: z
      .string()
      .trim()
      .regex(RATE_TEXT, { message: 'Use a number with at most eight decimal places.' })
      .refine((v) => /[1-9]/.test(v), { message: 'The rate must be above zero.' }),
    asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type FxRateInput = z.infer<typeof fxRateInput>;

export const fxConvertQuery = z
  .object({
    amount: z.string().regex(/^-?\d+(\.\d{1,4})?$/),
    currency: z.enum(FX_CURRENCIES as unknown as [string, ...string[]]),
    at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

/** US dollars to the display currency at `rate` (units of the currency per dollar), as text. */
export function convertUsd(amount: Money, rate: string, currency: string): string {
  if (!RATE_TEXT.test(rate)) throw new RangeError('The exchange rate is not valid.');
  const places = currency in MINOR ? 0 : 2;
  const text = roundMoney(amount.mul(rate), places, 'half_up').toDbString();
  return places === 0 ? (text.split('.')[0] ?? '0') : text.slice(0, -2);
}
