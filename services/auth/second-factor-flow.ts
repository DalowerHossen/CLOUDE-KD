// path: services/auth/second-factor-flow.ts
// Second step of sign-in and the first-time setup that is forced on account holders. Wrong codes feed the same
// counter as wrong passwords (lock engine).
import 'server-only';
import { z } from 'zod';
import { UnauthorizedError } from '@/lib/errors';
import { lookupUserByEmail, type KnownUser } from './credentials';
import { completeLogin, GENERIC_LOGIN_MESSAGE, redirectFor } from './login-flow';
import { recordLoginEvent } from './login-events';
import { checkLock, recordFailure } from './lock-service';
import { readPendingLogin, setPendingLogin, type PendingLogin } from './pending-login';
import {
  beginEnrollment,
  confirmEnrollment,
  disableTwoFactor,
  verifySecondFactor,
  type EnrollmentStart,
} from './two-factor-service';

export const verifyCodeSchema = z
  .object({ code: z.string().trim().min(6).max(20), recover: z.boolean().default(false) })
  .strict();
export const confirmSetupSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
  })
  .strict();

const fail = (): never => {
  throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
};

async function requirePending(
  purpose: PendingLogin['purpose'],
): Promise<{ pending: PendingLogin; user: KnownUser }> {
  const pending = await readPendingLogin();
  if (!pending || pending.purpose !== purpose) return fail();
  const lock = await checkLock(pending.identifier);
  if (lock.locked) {
    await recordLoginEvent({
      identifierHash: pending.identifier,
      type: 'blocked_while_locked',
      userId: lock.userId,
    });
    return fail();
  }
  const user = await lookupUserByEmail(pending.email);
  if (!user || !user.active || user.userId !== pending.userId) return fail();
  return { pending, user };
}

export type SecondFactorOutcome =
  { status: 'ok'; redirectTo: string } | { status: 'two_factor_setup_required' };

export async function verifyLoginCode(
  input: z.infer<typeof verifyCodeSchema>,
): Promise<SecondFactorOutcome> {
  const { pending, user } = await requirePending('login-2fa');
  const check = await verifySecondFactor(user.userId, input.code);
  if (!check.ok) {
    await recordFailure(pending.identifier, 'two_factor', {
      userId: user.userId,
      companyId: user.companyId,
    });
    return fail();
  }
  await recordLoginEvent({
    identifierHash: pending.identifier,
    type: check.usedBackupCode ? 'backup_code_used' : 'two_factor_success',
    userId: user.userId,
    companyId: user.companyId,
  });
  if (check.usedBackupCode && input.recover) {
    // Lost device: the backup code proves identity; 2FA is reset and must be set up again before access is granted.
    await disableTwoFactor(user.userId);
    await setPendingLogin({ ...pending, purpose: 'setup-2fa' });
    return { status: 'two_factor_setup_required' };
  }
  await completeLogin({
    user,
    email: pending.email,
    identifier: pending.identifier,
    rememberMe: pending.rememberMe,
    aal: 'aal2',
  });
  return { status: 'ok', redirectTo: redirectFor(user) };
}

export async function beginPendingSetup(): Promise<EnrollmentStart> {
  const { user, pending } = await requirePending('setup-2fa');
  return beginEnrollment(user.userId, user.companyId, pending.email);
}

export async function confirmPendingSetup(
  input: z.infer<typeof confirmSetupSchema>,
): Promise<{ backupCodes: string[]; redirectTo: string }> {
  const { pending, user } = await requirePending('setup-2fa');
  const codes = await confirmEnrollment(user.userId, user.companyId, input.code);
  if (!codes) {
    await recordFailure(pending.identifier, 'two_factor', {
      userId: user.userId,
      companyId: user.companyId,
    });
    return fail();
  }
  await completeLogin({
    user,
    email: pending.email,
    identifier: pending.identifier,
    rememberMe: pending.rememberMe,
    aal: 'aal2',
  });
  return { backupCodes: codes, redirectTo: redirectFor(user) };
}
