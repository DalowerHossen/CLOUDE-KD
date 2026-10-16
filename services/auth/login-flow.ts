// path: services/auth/login-flow.ts
// Sign-in orchestration. One generic failure for every reason (wrong password, wrong code, locked, unknown account).
import 'server-only';
import {
  IP_FAILURE_LIMIT,
  IP_FAILURE_WINDOW_SECONDS,
  LOGIN_CAPTCHA_AFTER_FAILURES,
  OWNER_2FA_GRACE_DAYS,
} from '@/config/auth-lock';
import { getService } from '@/lib/container';
import { RateLimitError, UnauthorizedError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { clearPendingLogin, setPendingLogin } from './pending-login';
import {
  hasActiveFactor,
  lookupUserByEmail,
  mintSession,
  verifyPassword,
  type KnownUser,
} from './credentials';
import { currentIpFailures, recordLoginEvent } from './login-events';
import { checkLock, hashIdentifier, recordFailure, recordSuccess } from './lock-service';
import { openSessionRecord } from './session-service';

const log = createLogger({ component: 'login-flow' });

export const GENERIC_LOGIN_MESSAGE =
  'Email or password is incorrect, or sign-in is not available right now.';

export type LoginOutcome =
  | { status: 'ok'; redirectTo: string }
  | { status: 'two_factor_required' }
  | { status: 'two_factor_setup_required' };

/** Fixed targets only, so the response can never become an open redirect. */
export function redirectFor(user: KnownUser): string {
  return user.role === 'owner' || user.role === 'staff' ? '/dashboard' : '/admin';
}

const fail = (): never => {
  throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
};

/** Owners may postpone 2FA setup for OWNER_2FA_GRACE_DAYS after sign-up; every other account holder must set it up. */
export function mustSetUpTwoFactor(user: KnownUser, now: Date = new Date()): boolean {
  if (user.role === 'owner') {
    return now.getTime() - Date.parse(user.createdAt) > OWNER_2FA_GRACE_DAYS * 86_400_000;
  }
  return true;
}

export async function startLogin(input: {
  email: string;
  password: string;
  rememberMe: boolean;
  turnstileToken: string | null;
  ip: string;
}): Promise<LoginOutcome> {
  const security = getService('security');
  const failures = await currentIpFailures(IP_FAILURE_WINDOW_SECONDS);
  if (failures >= IP_FAILURE_LIMIT) throw new RateLimitError(IP_FAILURE_WINDOW_SECONDS);
  if (failures >= LOGIN_CAPTCHA_AFTER_FAILURES) {
    if (
      !input.turnstileToken ||
      !(await security.verifyTurnstile(input.turnstileToken, input.ip))
    ) {
      throw new ValidationError('Please complete the security check.', [
        { path: 'turnstileToken', message: 'required' },
      ]);
    }
  }

  const identifier = await hashIdentifier(input.email);
  const lock = await checkLock(identifier);
  if (lock.locked) {
    await recordLoginEvent({
      identifierHash: identifier,
      type: 'blocked_while_locked',
      userId: lock.userId,
    });
    return fail();
  }

  const user = await lookupUserByEmail(input.email);
  const passwordOk = await verifyPassword(input.email, input.password);
  if (!passwordOk || !user || !user.active) {
    await recordFailure(identifier, 'password', {
      userId: user?.userId ?? null,
      companyId: user?.companyId ?? null,
    });
    return fail();
  }

  return finishPrimaryAuth({ user, email: input.email, identifier, rememberMe: input.rememberMe });
}

/**
 * The first factor (password or provider sign-in) was accepted. Decides between a finished login, the second factor
 * and the forced 2FA setup.
 */
export async function finishPrimaryAuth(input: {
  user: KnownUser;
  email: string;
  identifier: string;
  rememberMe: boolean;
}): Promise<LoginOutcome> {
  const { user, identifier } = input;
  const factor = await hasActiveFactor(user.userId);
  if (factor || mustSetUpTwoFactor(user)) {
    await setPendingLogin({
      userId: user.userId,
      identifier,
      email: input.email.trim().toLowerCase(),
      purpose: factor ? 'login-2fa' : 'setup-2fa',
      rememberMe: input.rememberMe,
    });
    return { status: factor ? 'two_factor_required' : 'two_factor_setup_required' };
  }
  await completeLogin({
    user,
    email: input.email,
    identifier,
    rememberMe: input.rememberMe,
    aal: 'aal1',
  });
  return { status: 'ok', redirectTo: redirectFor(user) };
}

/** Called after the password and, when required, the second factor are accepted. */
export async function completeLogin(input: {
  user: KnownUser;
  email: string;
  identifier: string;
  rememberMe: boolean;
  aal: 'aal1' | 'aal2';
}): Promise<void> {
  const accepted = await recordSuccess(input.identifier, input.user.userId, input.user.companyId);
  if (!accepted) return fail();
  const minted = await mintSession(input.email);
  await clearPendingLogin();
  try {
    await openSessionRecord({
      userId: input.user.userId,
      email: input.email,
      companyId: input.user.companyId,
      authSessionId: minted.authSessionId,
      identifier: input.identifier,
      rememberMe: input.rememberMe,
      aal: input.aal,
    });
  } catch (error) {
    log.error('session record failed', { error });
  }
  await recordLoginEvent({
    identifierHash: input.identifier,
    type: 'login_success',
    userId: input.user.userId,
    companyId: input.user.companyId,
  });
  await getService('audit').record({
    action: 'auth.login_succeeded',
    resourceType: 'user',
    resourceId: input.user.userId,
    companyId: input.user.companyId,
    metadata: { aal: input.aal },
  });
}

export async function logoutCurrent(
  userId: string | null,
  authSessionId: string | null,
): Promise<void> {
  if (userId && authSessionId) {
    await getAdminSupabase()
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString(), revoke_reason: 'logout' })
      .eq('auth_session_id', authSessionId);
  }
}
