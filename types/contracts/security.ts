// path: types/contracts/security.ts
import type { NetworkContext } from './common';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface NetworkCheckResult {
  vpn: boolean;
  proxy: boolean;
  tor: boolean;
  datacenter: boolean;
  /** ISO 3166-1 alpha-2 code or null when unknown. */
  countryCode: string | null;
  /** 0 (clean) to 100 (high risk). */
  score: number;
  allowed: boolean;
  reason: string | null;
}

export type SecurityEventType =
  | 'sql_injection_attempt'
  | 'xss_attempt'
  | 'csrf_failure'
  | 'brute_force'
  | 'credential_stuffing'
  | 'token_abuse'
  | 'webhook_signature_invalid'
  | 'network_blocked'
  | 'account_takeover_signal'
  | 'data_exfiltration_signal'
  | 'other';

export interface SecurityService {
  rateLimit(key: string, policy: string): Promise<RateLimitResult>;
  verifyTurnstile(token: string, ip: string): Promise<boolean>;
  checkNetwork(ip: string, context: NetworkContext): Promise<NetworkCheckResult>;
  riskScore(subject: { ip?: string; userId?: string; deviceId?: string }): Promise<number>;
  raiseSecurityEvent(type: SecurityEventType, details: Record<string, unknown>): Promise<void>;
  /** Deep copy with Unicode NFC, null bytes, zero-width and RTL override characters removed. */
  sanitize<T>(input: T): T;
}
