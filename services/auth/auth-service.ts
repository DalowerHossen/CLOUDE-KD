// path: services/auth/auth-service.ts
// Implements the auth contract (CONTRACTS.md: getActor, requireRole, requireStepUp, lockState).
import 'server-only';
import type { AuthService } from '@/types/contracts';
import { currentActor } from './actor';
import { checkLock } from './lock-service';
import { assertRole, assertStepUp } from '@/lib/auth/step-up';

export function createAuthService(): AuthService {
  return {
    getActor: currentActor,
    requireRole: (actor, roles) => assertRole(actor, roles),
    requireStepUp: async (actor, options) => assertStepUp(actor, options),
    lockState: async (identifierHash) => {
      const lock = await checkLock(identifierHash);
      return { locked: lock.locked, lockedUntil: lock.lockedUntil };
    },
  };
}
