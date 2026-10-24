// path: lib/security/siem/rules.ts
// Correlation rules: several events of the same kind from one address or actor inside a window.
import type { SiemSeverity } from './types';

export interface CorrelationRule {
  id: string;
  title: string;
  types: readonly string[];
  groupBy: 'ip_hash' | 'actor_user_id';
  windowMinutes: number;
  threshold: number;
  severity: Exclude<SiemSeverity, 'info'>;
}

export const CORRELATION_RULES: readonly CorrelationRule[] = [
  {
    id: 'auth.brute_force.ip',
    title: 'Repeated sign-in attacks from one address',
    types: ['brute_force', 'credential_stuffing'],
    groupBy: 'ip_hash',
    windowMinutes: 10,
    threshold: 5,
    severity: 'high',
  },
  {
    id: 'injection.ip',
    title: 'Repeated injection attempts from one address',
    types: ['sql_injection_attempt', 'xss_attempt'],
    groupBy: 'ip_hash',
    windowMinutes: 15,
    threshold: 3,
    severity: 'high',
  },
  {
    id: 'csrf.ip',
    title: 'Repeated forged requests from one address',
    types: ['csrf_failure'],
    groupBy: 'ip_hash',
    windowMinutes: 10,
    threshold: 5,
    severity: 'medium',
  },
  {
    id: 'token.abuse.ip',
    title: 'Repeated token abuse from one address',
    types: ['token_abuse'],
    groupBy: 'ip_hash',
    windowMinutes: 60,
    threshold: 3,
    severity: 'high',
  },
  {
    id: 'webhook.signature.ip',
    title: 'Repeated invalid webhook signatures from one address',
    types: ['webhook_signature_invalid'],
    groupBy: 'ip_hash',
    windowMinutes: 30,
    threshold: 3,
    severity: 'medium',
  },
  {
    id: 'takeover.actor',
    title: 'Account takeover signal',
    types: ['account_takeover_signal'],
    groupBy: 'actor_user_id',
    windowMinutes: 60,
    threshold: 1,
    severity: 'critical',
  },
  {
    id: 'exfiltration.actor',
    title: 'Data exfiltration signal',
    types: ['data_exfiltration_signal'],
    groupBy: 'actor_user_id',
    windowMinutes: 60,
    threshold: 1,
    severity: 'critical',
  },
];

/** Window used for indicator-of-compromise matching on each run. */
export const IOC_WINDOW_MINUTES = 15;
