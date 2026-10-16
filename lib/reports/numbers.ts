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
