// path: services/security/register.ts
// Registers the services of the security domain: security (rate limit, Turnstile, network check, risk score, events,
// sanitizer), idempotency and tokens.
import { registerService } from '@/lib/container';
import { createIdempotencyService } from './idempotency-service';
import { createSecurityService } from './security-service';
import { createTokenService } from './token-service';

export default async function register(): Promise<void> {
  registerService('security', createSecurityService());
  registerService('idempotency', createIdempotencyService());
  registerService('tokens', createTokenService());
}
