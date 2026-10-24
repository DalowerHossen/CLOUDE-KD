// path: lib/marketing/significance.ts
// Two-proportion z-test for an A/B experiment: is the variant's conversion rate different from the control's?
// Pure functions. Counts are visitors and conversions, never money.

export interface Arm {
  exposures: number;
  conversions: number;
}

/** Standard normal cumulative distribution (Abramowitz and Stegun 7.1.26 approximation of the error function). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export interface SignificanceResult {
  z: number;
  pValue: number;
  /** True when the difference is unlikely to be chance (p below 0.05) and each arm has at least 100 visitors. */
  significant: boolean;
}

export function significance(control: Arm, variant: Arm): SignificanceResult {
  const n1 = control.exposures;
  const n2 = variant.exposures;
  if (n1 === 0 || n2 === 0) return { z: 0, pValue: 1, significant: false };
  const p1 = control.conversions / n1;
  const p2 = variant.conversions / n2;
  const pooled = (control.conversions + variant.conversions) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return { z: 0, pValue: 1, significant: false };
  const z = (p2 - p1) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { z, pValue, significant: pValue < 0.05 && n1 >= 100 && n2 >= 100 };
}
