// path: services/auth/lock-service.ts
// Server side of the lock engine (REQ-LOCK). Every state change is one database function call.
import 'server-only';
import { LOCK_DURATION_SECONDS, LOCK_THRESHOLD } from '@/config/auth-lock';
import { tryGetService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { InternalError } from '@/lib/errors';
import {
  identifierHash,
  lockCheckSchema,
  lockFailureSchema,
  type FailureKind,
  type LockCheck,
  type LockFailure,
} from '@/lib/auth/lock';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { recordLoginEvent } from './login-events';
import { notifyLockStarted } from './lock-alerts';

const log = createLogger({ component: 'lock' });

export const hashIdentifier = (email: string): Promise<string> =>
  identifierHash(email, getServerEnv().HMAC_TOKEN_SECRET);

export async function checkLock(identifier: string): Promise<LockCheck> {
  const { data, error } = await getAdminSupabase().rpc('kd_lock_check', {
    p_identifier: identifier,
  });
  if (error) throw new InternalError(error);
  return lockCheckSchema.parse(data);
}

/** Counts a failure. Starts the lock at the threshold, sends the alerts and the event once. */
export async function recordFailure(
  identifier: string,
  kind: FailureKind,
  who: { userId?: string | null; companyId?: string | null } = {},
): Promise<LockFailure> {
  const { data, error } = await getAdminSupabase().rpc('kd_lock_record_failure', {
    p_identifier: identifier,
    p_user: who.userId ?? null,
    p_company: who.companyId ?? null,
    p_kind: kind,
    p_threshold: LOCK_THRESHOLD,
    p_duration_seconds: LOCK_DURATION_SECONDS,
  });
  if (error) throw new InternalError(error);
  const result = lockFailureSchema.parse(data);
  await recordLoginEvent({
    identifierHash: identifier,
    type:
      result.locked && !result.justLocked
        ? 'blocked_while_locked'
        : kind === 'password'
          ? 'login_failed'
          : 'two_factor_failed',
    userId: result.userId ?? who.userId ?? null,
    companyId: result.companyId ?? who.companyId ?? null,
  });
  if (result.justLocked) {
    await recordLoginEvent({
      identifierHash: identifier,
      type: 'locked',
      userId: result.userId ?? null,
      companyId: result.companyId ?? null,
      detail: { reason: result.lockReason ?? kind },
    });
    if (result.userId) {
      try {
        await notifyLockStarted({
          userId: result.userId,
          companyId: result.companyId ?? null,
          lockedUntil: result.lockedUntil,
        });
        await tryGetService('events')?.publish({
          name: 'auth.account_locked',
          companyId: result.companyId ?? null,
          payload: {
            userId: result.userId,
            lockedUntil: result.lockedUntil,
            reason: result.lockReason ?? kind,
          },
        });
        await getAdminSupabase().rpc('kd_revoke_user_sessions', {
          p_user: result.userId,
          p_except: null,
          p_reason: 'account_locked',
        });
      } catch (failure) {
        log.error('lock side effects failed', { error: failure });
      }
    }
  }
  return result;
}

/** Full login completed. Returns false (and changes nothing) while the account is locked. */
export async function recordSuccess(
  identifier: string,
  userId: string,
  companyId: string | null,
): Promise<boolean> {
  const { data, error } = await getAdminSupabase().rpc('kd_lock_record_success', {
    p_identifier: identifier,
    p_user: userId,
    p_company: companyId,
  });
  if (error) throw new InternalError(error);
  return data === true;
}

export async function unlockIdentifier(identifier: string): Promise<boolean> {
  const { data, error } = await getAdminSupabase().rpc('kd_lock_unlock', {
    p_identifier: identifier,
  });
  if (error) throw new InternalError(error);
  return data === true;
}
