// path: services/security/register.ts
// Registers the services of the security domain. `security` is registered at the end of 04.7 when every
// operation of its contract exists; `idempotency` is complete now.
import { registerService } from '@/lib/container';
import { createIdempotencyService } from './idempotency-service';

export default async function register(): Promise<void> {
  registerService('idempotency', createIdempotencyService());
}
