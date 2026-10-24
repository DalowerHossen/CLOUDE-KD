// path: lib/security/zero-trust.ts
// Zero-tolerance policy: some security events end in a hard action at once, without waiting for a risk score.
import type { SecurityEventType } from '@/types/contracts';
import type { FraudAction } from './fraud-engine';

export interface ZeroToleranceRule {
  actions: readonly FraudAction[];
  banMinutes?: number;
}

export const ZERO_TOLERANCE: Readonly<Partial<Record<SecurityEventType, ZeroToleranceRule>>> = {
  sql_injection_attempt: { actions: ['ban_ip', 'alert'], banMinutes: 1440 },
  xss_attempt: { actions: ['ban_ip', 'alert'], banMinutes: 1440 },
  credential_stuffing: { actions: ['ban_ip', 'alert'], banMinutes: 1440 },
  token_abuse: { actions: ['ban_ip', 'alert'], banMinutes: 1440 },
  account_takeover_signal: { actions: ['terminate_sessions', 'lock_user', 'alert'] },
  data_exfiltration_signal: { actions: ['terminate_sessions', 'lock_user', 'alert'] },
};

export function zeroToleranceFor(type: SecurityEventType): ZeroToleranceRule | null {
  return ZERO_TOLERANCE[type] ?? null;
}

/** Every request is checked again (never trust, always verify): what a caller must prove for a given risk. */
export function requiredProof(
  action: 'allow' | 'monitor' | 'step_up' | 'hold' | 'block',
): 'none' | 'step_up' | 'manual_review' | 'refuse' {
  if (action === 'block') return 'refuse';
  if (action === 'hold') return 'manual_review';
  if (action === 'step_up') return 'step_up';
  return 'none';
}
