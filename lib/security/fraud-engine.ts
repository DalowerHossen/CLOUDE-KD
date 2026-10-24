// path: lib/security/fraud-engine.ts
// Rule engine: a rule fires when enough signals of one type were recorded for a subject inside its window.
// Pure: the service supplies the counts. Rules are data, so a new rule is a new line, not new code.
export type FraudAction = 'step_up' | 'terminate_sessions' | 'lock_user' | 'ban_ip' | 'alert';

export interface FraudRule {
  id: string;
  signal: string;
  /** Signals of this type needed inside the window. */
  minCount: number;
  windowMinutes: number;
  subject: 'user' | 'ip';
  actions: readonly FraudAction[];
  banMinutes?: number;
}

export const FRAUD_RULES: readonly FraudRule[] = [
  {
    id: 'csrf-burst',
    signal: 'csrf_failure',
    minCount: 5,
    windowMinutes: 5,
    subject: 'ip',
    actions: ['ban_ip', 'alert'],
    banMinutes: 15,
  },
  {
    id: 'injection-repeat',
    signal: 'sql_injection_attempt',
    minCount: 2,
    windowMinutes: 60,
    subject: 'ip',
    actions: ['ban_ip', 'alert'],
    banMinutes: 1440,
  },
  {
    id: 'xss-repeat',
    signal: 'xss_attempt',
    minCount: 2,
    windowMinutes: 60,
    subject: 'ip',
    actions: ['ban_ip', 'alert'],
    banMinutes: 1440,
  },
  {
    id: 'webhook-forgery',
    signal: 'webhook_signature_invalid',
    minCount: 3,
    windowMinutes: 10,
    subject: 'ip',
    actions: ['ban_ip', 'alert'],
    banMinutes: 60,
  },
  {
    id: 'token-guessing',
    signal: 'token_abuse',
    minCount: 3,
    windowMinutes: 10,
    subject: 'ip',
    actions: ['ban_ip', 'alert'],
    banMinutes: 1440,
  },
  {
    id: 'multi-account-ip',
    signal: 'multi_account_ip',
    minCount: 3,
    windowMinutes: 1440,
    subject: 'ip',
    actions: ['alert'],
  },
  {
    id: 'hijack-signs',
    signal: 'session_ip_change',
    minCount: 2,
    windowMinutes: 60,
    subject: 'user',
    actions: ['terminate_sessions', 'step_up', 'alert'],
  },
  {
    id: 'insider-bulk',
    signal: 'insider_bulk_activity',
    minCount: 1,
    windowMinutes: 60,
    subject: 'user',
    actions: ['step_up', 'alert'],
  },
  {
    id: 'country-jump',
    signal: 'country_jump',
    minCount: 1,
    windowMinutes: 120,
    subject: 'user',
    actions: ['step_up', 'alert'],
  },
];

export interface RuleHit {
  rule: FraudRule;
  count: number;
}

export function evaluateRule(rule: FraudRule, count: number): RuleHit | null {
  return count >= rule.minCount ? { rule, count } : null;
}

export function rulesForSignal(signal: string, subject: 'user' | 'ip'): FraudRule[] {
  return FRAUD_RULES.filter((r) => r.signal === signal && r.subject === subject);
}
