// path: services/payment/report-math.ts
// Integer-only arithmetic for the payment reports (no JavaScript Number involved).

/** Share in percent with one decimal ("98.5"), or null when the base is zero. */
export function percentText(part: bigint, whole: bigint): string | null {
  if (whole === 0n) return null;
  const permille = (part * 1000n) / whole;
  return `${permille / 10n}.${permille % 10n}`;
}
