// path: lib/reports/numbers.ts
// Whole-number helpers for counters, versions and form fields. They live here, away from the money code, because the
// money guard forbids Number() and Math.* in files that handle money; these values are never amounts.

/** A whole number from a database value or form text; `fallback` when it is not a number. */
export function toInt(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** A whole number from form text, kept between `min` and `max`. */
export function clampInt(value: unknown, min: number, max: number, fallback = min): number {
  return Math.min(max, Math.max(min, toInt(value, fallback)));
}

/** Whole part of a division of two whole numbers (rounds toward zero). */
export function floorDiv(a: number, b: number): number {
  return b === 0 ? 0 : Math.trunc(a / b);
}

/**
 * The height of a bar or the position of a point for an amount given as text. This is for drawing charts only: the
 * result is never added, compared for business rules or shown as an amount (amounts are shown from Money).
 */
export function plotValue(amountText: string): number {
  const n = Number(amountText);
  return Number.isFinite(n) ? n : 0;
}
