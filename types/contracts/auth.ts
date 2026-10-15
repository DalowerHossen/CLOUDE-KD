// path: types/contracts/auth.ts
import type { Actor, Role } from './common';

export interface AuthService {
  /** Returns the authenticated actor of the current request, or null. */
  getActor(): Promise<Actor | null>;
  /** Throws ForbiddenError when the actor role is not listed. */
  requireRole(actor: Actor, roles: readonly Role[]): void;
  /** Throws StepUpRequiredError unless the actor passed 2FA and a fresh password check within the time. */
  requireStepUp(actor: Actor, options: { maxAgeSeconds: number }): Promise<void>;
  /** Lock state for an identifier hash (HMAC of the normalized e-mail). */
  lockState(identifierHash: string): Promise<{ locked: boolean; lockedUntil: string | null }>;
}
