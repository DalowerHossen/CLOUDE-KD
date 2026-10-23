// path: services/auth/reset-flow.ts
// Forgot and reset password. The request always answers the same neutral message. While an account is locked no
// token is issued or accepted. A token works once and dies when a lock starts (database function).
import 'server-only';
import { z } from 'zod';
import { PASSWORD_RESET_TTL_SECONDS } from '@/config/auth-lock';
import { getService, tryGetService } from '@/lib/container';
import { getPublicEnv } from '@/lib/env/public';
import { InternalError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { randomBase64Url, randomHex, sha256Hex } from '@/lib/utils/hash';
import { lookupUserByEmail } from './credentials';
import { hashIdentifier } from './lock-service';
import { recordLoginEvent } from './login-events';
import { changePassword, enforcePasswordRules } from './password-service';

export const NEUTRAL_RESET_MESSAGE =
  'If an account exists for this address, we sent a message with the next steps.';
const INVALID_LINK = 'This link is not valid anymore. Ask for a new one.';

export const forgotSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    turnstileToken: z.string().min(1).max(4096),
  })
  .strict();

export const resetSchema = z
  .object({
    identifier: z.string().regex(/^[0-9a-f]{64}$/),
    token: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/),
    password: z.string().min(1).max(256),
    turnstileToken: z.string().min(1).max(4096),
  })
  .strict();

async function requireHuman(token: string, ip: string): Promise<void> {
  if (!(await getService('security').verifyTurnstile(token, ip))) {
    throw new ValidationError('Please complete the security check.', [
      { path: 'turnstileToken', message: 'invalid' },
    ]);
  }
}

export async function requestReset(input: z.infer<typeof forgotSchema>, ip: string): Promise<void> {
  await requireHuman(input.turnstileToken, ip);
  const identifier = await hashIdentifier(input.email);
  const user = await lookupUserByEmail(input.email);
  if (!user || !user.active) {
    await recordLoginEvent({
      identifierHash: identifier,
      type: 'reset_suppressed',
      detail: { why: 'unknown' },
    });
    return;
  }
  const token = randomBase64Url(32);
  const issued = await getAdminSupabase().rpc('kd_reset_token_issue', {
    p_identifier: identifier,
    p_user: user.userId,
    p_token_hash: await sha256Hex(token),
    p_ttl_seconds: PASSWORD_RESET_TTL_SECONDS,
  });
  if (issued.error) throw new InternalError(issued.error);
  if (issued.data !== true) {
    await recordLoginEvent({
      identifierHash: identifier,
      type: 'reset_suppressed',
      userId: user.userId,
      detail: { why: 'locked' },
    });
    return;
  }
  await recordLoginEvent({
    identifierHash: identifier,
    type: 'reset_requested',
    userId: user.userId,
    companyId: user.companyId,
  });
  await tryGetService('email')?.send({
    template: 'auth.reset-password',
    to: input.email,
    companyId: user.companyId,
    data: {
      resetUrl: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/reset-password?i=${identifier}&t=${token}`,
    },
    idempotencyKey: `reset-${randomHex(16)}`,
  });
}

export async function completeReset(input: z.infer<typeof resetSchema>, ip: string): Promise<void> {
  await requireHuman(input.turnstileToken, ip);
  const admin = getAdminSupabase();
  const tokenHash = await sha256Hex(input.token);
  const consumed = await admin.rpc('kd_reset_token_consume', {
    p_identifier: input.identifier,
    p_token_hash: tokenHash,
  });
  if (consumed.error) throw new InternalError(consumed.error);
  const parsed = z.string().uuid().safeParse(consumed.data);
  if (!parsed.success) throw new ValidationError(INVALID_LINK);
  const userId = parsed.data;

  const profile = await admin
    .from('profiles')
    .select('email, company_id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (profile.error || !profile.data) throw new ValidationError(INVALID_LINK);
  const email = String(profile.data.email);
  const companyId = profile.data.company_id ? String(profile.data.company_id) : null;
  try {
    await enforcePasswordRules(input.password, email, userId);
  } catch (error) {
    // The user may try again with the same link while it is still valid.
    await admin.rpc('kd_reset_token_issue', {
      p_identifier: input.identifier,
      p_user: userId,
      p_token_hash: tokenHash,
      p_ttl_seconds: 600,
    });
    throw error;
  }
  await changePassword(userId, companyId, input.password, null);
  await recordLoginEvent({
    identifierHash: input.identifier,
    type: 'reset_completed',
    userId,
    companyId,
  });
  await getService('audit').record({
    action: 'auth.password_reset',
    resourceType: 'user',
    resourceId: userId,
    companyId,
  });
  await tryGetService('email')?.send({
    template: 'auth.password-changed',
    to: email,
    companyId,
    data: { time: new Date().toISOString() },
    idempotencyKey: `pwchg-${randomHex(16)}`,
  });
}
