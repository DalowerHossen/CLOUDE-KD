// path: lib/auth/step-up.ts
// Pure step-up and role checks used by the auth service and by the verification script.
import { STEP_UP_DEFAULT_SECONDS } from '@/config/auth-lock';
import { ForbiddenError, StepUpRequiredError } from '@/lib/errors';
import type { Actor, Role } from '@/types/contracts';

export function assertRole(actor: Pick<Actor, 'role'>, roles: readonly Role[]): void {
  if (!roles.includes(actor.role)) throw new ForbiddenError();
}

/** Throws StepUpRequiredError unless the last step-up (password plus 2FA code) is younger than the limit. */
export function assertStepUp(
  actor: Pick<Actor, 'lastStepUpAt'>,
  options: { maxAgeSeconds?: number } = {},
  now: Date = new Date(),
): void {
  const maxAge = options.maxAgeSeconds ?? STEP_UP_DEFAULT_SECONDS;
  if (!actor.lastStepUpAt || now.getTime() - Date.parse(actor.lastStepUpAt) > maxAge * 1000) {
    throw new StepUpRequiredError();
  }
}
