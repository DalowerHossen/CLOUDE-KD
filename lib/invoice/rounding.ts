// path: lib/invoice/rounding.ts
// Rounding of money to 0 to 4 decimal places with a chosen rule. Works on the exact four-place text of `Money`, so no
// binary floating point is involved. Safe to import in the browser.
import { Money } from '@/lib/utils/currency';

export const ROUNDING_MODES = ['half_up', 'half_even'] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

/** Places an invoice may be rounded to. Storage is numeric(18,4), so six places cannot be kept. */
export const PRECISIONS = [2, 3, 4] as const;
export type Precision = (typeof PRECISIONS)[number];

/**
 * Rounds to `places` decimal places. "half_up" rounds .5 away from zero; "half_even" (banker's rounding) rounds .5 to
 * the nearest even last digit, which avoids a systematic upward drift over many lines.
 */
export function roundMoney(value: Money, places: number, mode: RoundingMode): Money {
  if (!Number.isInteger(places) || places < 0 || places > 4)
    throw new RangeError('Rounding places must be 0 to 4.');
  const text = value.toDbString();
  const negative = text.startsWith('-');
  const abs = negative ? text.slice(1) : text;
  const [integer = '0', fraction = '0000'] = abs.split('.');
  const kept = fraction.slice(0, places);
  const rest = fraction.slice(places);
  if (rest === '') return value;
  const half = `5${'0'.repeat(rest.length - 1)}`;
  const lastDigit = (places === 0 ? integer : kept).slice(-1);
  const goesUp =
    rest > half || (rest === half && (mode === 'half_up' || '13579'.includes(lastDigit)));
  const truncated = Money.parse(places === 0 ? integer : `${integer}.${kept}`);
  const unit = Money.parse(places === 0 ? '1' : `0.${'0'.repeat(places - 1)}1`);
  const rounded = goesUp ? truncated.add(unit) : truncated;
  return negative ? rounded.negate() : rounded;
}

/** Cash rounding steps for the final total (for example to the nearest 0.05). */
export const CASH_ROUNDING_STEPS = ['0', '0.05', '0.10', '0.50', '1'] as const;
export type CashRounding = (typeof CASH_ROUNDING_STEPS)[number];

/** Difference that moves `total` to the nearest multiple of `step` (half up). Zero when the step is "0". */
export function cashRoundingAdjustment(total: Money, step: CashRounding): Money {
  if (step === '0') return Money.zero();
  const multiples = roundMoney(total.div(step), 0, 'half_up');
  return multiples.mul(step).sub(total);
}
