// path: lib/auth/impersonation.ts
// Rules for support impersonation (pure): who may start it, who may be impersonated, and the end time.
import { IMPERSONATION_MAX_SECONDS } from '@/config/auth-lock';
import type { Role } from '@/types/contracts';

export type ImpersonationCheck =
  'ok' | 'not_super_admin' | 'target_is_platform_role' | 'self' | 'inactive' | 'no_step_up';

export function checkImpersonation(input: {
  actorRole: Role;
  actorId: string;
  targetRole: Role | null;
  targetId: string;
  targetActive: boolean;
  stepUpFresh: boolean;
}): ImpersonationCheck {
  if (input.actorRole !== 'super_admin') return 'not_super_admin';
  if (!input.stepUpFresh) return 'no_step_up';
  if (input.actorId === input.targetId) return 'self';
  if (
    input.targetRole === null ||
    input.targetRole === 'super_admin' ||
    input.targetRole === 'ceo' ||
    input.targetRole === 'admin_staff'
  ) {
    return 'target_is_platform_role';
  }
  if (!input.targetActive) return 'inactive';
  return 'ok';
}

export function impersonationEnd(from: Date, requestedSeconds?: number): Date {
  const seconds = Math.min(
    Math.max(60, requestedSeconds ?? IMPERSONATION_MAX_SECONDS),
    IMPERSONATION_MAX_SECONDS,
  );
  return new Date(from.getTime() + seconds * 1000);
}

/** Actions that must never run inside an impersonated session. */
export const BLOCKED_WHILE_IMPERSONATING: readonly string[] = [
  'password change',
  'two-step verification change',
  'session revoke',
  'provider linking',
];
