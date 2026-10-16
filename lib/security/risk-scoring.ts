// path: lib/security/risk-scoring.ts
// Risk and trust scoring (pure). Risk runs from 0 (clean) to 100; trust is the opposite.
export interface RiskParts {
  user?: number;
  device?: number;
  network?: number;
  transaction?: number;
  company?: number;
}

export interface TrustScores {
  user: number;
  device: number;
  network: number;
  transaction: number;
}

const clamp = (n: number): number => Math.min(100, Math.max(0, n));

export function trustScores(parts: RiskParts): TrustScores {
  return {
    user: clamp(100 - (parts.user ?? 0)),
    device: clamp(100 - (parts.device ?? 0)),
    network: clamp(100 - (parts.network ?? 0)),
    transaction: clamp(100 - (parts.transaction ?? 0)),
  };
}

/** The worst part decides; the second worst adds a quarter of its value, so two weak signs count more than one. */
export function combineRisk(parts: RiskParts): number {
  const values = Object.values(parts)
    .filter((v): v is number => typeof v === 'number')
    .map(clamp)
    .sort((a, b) => b - a);
  if (values.length === 0) return 0;
  return Math.round(clamp((values[0] ?? 0) + 0.25 * (values[1] ?? 0)));
}

export type AdaptiveAction = 'allow' | 'monitor' | 'step_up' | 'hold' | 'block';

/** Adaptive response: the higher the risk, the stronger the check (step-up = password and 2FA again). */
export function adaptiveAction(risk: number): AdaptiveAction {
  if (risk >= 95) return 'block';
  if (risk >= 80) return 'hold';
  if (risk >= 60) return 'step_up';
  if (risk >= 30) return 'monitor';
  return 'allow';
}
