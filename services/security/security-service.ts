// path: services/security/security-service.ts
// Implements the security contract: rate limit, Turnstile, network check, risk score, security events and input sanitizing.
import 'server-only';
import { combineRisk } from '@/lib/security/risk-scoring';
import { detectInjectionDeep, sanitize as sanitizeInput } from '@/lib/security/sanitizer';
import type { SecurityService } from '@/types/contracts';
import { riskOf } from '@/services/fraud/signals';
import { raiseEvent } from './events';
import { checkNetwork } from './network-service';
import { isIpBlocked, rateLimit } from './rate-limit';
import { verifyTurnstile } from './turnstile';
import { hashIp } from '@/services/audit/request-meta';

export function createSecurityService(): SecurityService {
  return {
    rateLimit,
    verifyTurnstile,
    checkNetwork,
    raiseSecurityEvent: raiseEvent,
    sanitize<T>(input: T): T {
      const hit = detectInjectionDeep(input);
      // The attempt is reported at once; the cleaned copy still goes to strict validation, which refuses bad values.
      if (hit) void raiseEvent(hit, { source: 'sanitizer' });
      return sanitizeInput(input);
    },
    async riskScore(subject) {
      const parts: { user?: number; device?: number; network?: number } = {};
      if (subject.userId) parts.user = await riskOf('user', subject.userId);
      if (subject.deviceId) parts.device = await riskOf('device', subject.deviceId);
      if (subject.ip) {
        const hash = await hashIp(subject.ip);
        parts.network = (await isIpBlocked(hash)) ? 100 : await riskOf('ip', hash);
      }
      return combineRisk(parts);
    },
  };
}
