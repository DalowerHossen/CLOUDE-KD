// path: services/auth/step-up.ts
// Step-up: a fresh password check plus a 2FA code, valid for a short time (default 300 seconds), kept on the session.
import 'server-only';
import { z } from 'zod';
import { InternalError, UnauthorizedError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { GENERIC_LOGIN_MESSAGE } from './login-flow';
import { verifyPassword } from './credentials';
import { checkLock, hashIdentifier, recordFailure } from './lock-service';
import { verifySecondFactor } from './two-factor-service';

export const stepUpSchema = z
  .object({ password: z.string().min(1).max(256), code: z.string().trim().min(6).max(20) })
  .strict();

/** Verifies password and code. Wrong values count toward the lock like at sign-in. */
export async function performStepUp(
  actor: Actor,
  input: z.infer<typeof stepUpSchema>,
): Promise<void> {
  const identifier = await hashIdentifier(actor.email);
  if ((await checkLock(identifier)).locked) throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
  if (!(await verifyPassword(actor.email, input.password))) {
    await recordFailure(identifier, 'password', {
      userId: actor.userId,
      companyId: actor.companyId,
    });
    throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
  }
  const check = await verifySecondFactor(actor.userId, input.code);
  if (!check.ok) {
    await recordFailure(identifier, 'two_factor', {
      userId: actor.userId,
      companyId: actor.companyId,
    });
    throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
  }
  const { error } = await getAdminSupabase()
    .from('user_sessions')
    .update({ step_up_at: new Date().toISOString() })
    .eq('id', actor.sessionId);
  if (error) throw new InternalError(error);
}
