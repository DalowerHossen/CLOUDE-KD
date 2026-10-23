// path: services/auth/account-ops.ts
// Operations of the account security page: sessions, devices, password change, 2FA management.
import 'server-only';
import { z } from 'zod';
import { currentActor } from './actor';
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { GENERIC_LOGIN_MESSAGE } from './login-flow';
import { verifyPassword } from './credentials';
import { checkLock, hashIdentifier, recordFailure } from './lock-service';
import { recordLoginEvent } from './login-events';
import { changePassword, enforcePasswordRules } from './password-service';
import { assertStepUp } from '@/lib/auth/step-up';
import { assertNotImpersonating } from './impersonation-flow';
import {
  beginEnrollment,
  confirmEnrollment,
  disableTwoFactor,
  isTwoFactorActive,
  remainingBackupCodes,
  storeNewBackupCodes,
  type EnrollmentStart,
} from './two-factor-service';
import { tryGetService } from '@/lib/container';
import { randomHex } from '@/lib/utils/hash';

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw new UnauthorizedError();
  return actor;
}

export const passwordChangeSchema = z
  .object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(1).max(256) })
  .strict();
export const sessionRevokeSchema = z.object({ sessionId: z.string().uuid() }).strict();
export const codeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
  })
  .strict();

export interface SessionItem {
  id: string;
  userId: string;
  device: string;
  network: string;
  lastActiveAt: string;
  createdAt: string;
  expiresAt: string;
  aal: string;
  current: boolean;
  revoked: boolean;
}

const sessionList = z.array(
  z
    .object({
      id: z.string().uuid(),
      user_id: z.string().uuid(),
      user_agent_label: z.string().nullable(),
      ip_masked: z.string().nullable(),
      last_active_at: z.string(),
      created_at: z.string(),
      expires_at: z.string(),
      aal: z.string(),
      revoked_at: z.string().nullable(),
    })
    .strip(),
);

/** Own sessions; an owner also sees the sessions of the staff of the same company. */
export async function listSessions(actor: Actor, includeCompany: boolean): Promise<SessionItem[]> {
  let query = getAdminSupabase()
    .from('user_sessions')
    .select(
      'id, user_id, user_agent_label, ip_masked, last_active_at, created_at, expires_at, aal, revoked_at',
    )
    .is('deleted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('last_active_at', { ascending: false })
    .limit(100);
  query =
    includeCompany && actor.role === 'owner' && actor.companyId
      ? query.eq('company_id', actor.companyId)
      : query.eq('user_id', actor.userId);
  const { data, error } = await query;
  if (error) throw new InternalError(error);
  return sessionList.parse(data).map((r) => ({
    id: r.id,
    userId: r.user_id,
    device: r.user_agent_label ?? 'Unknown device',
    network: r.ip_masked ?? 'unknown',
    lastActiveAt: r.last_active_at,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    aal: r.aal,
    current: r.id === actor.sessionId,
    revoked: r.revoked_at !== null,
  }));
}

/** Revokes one session. A user may end own sessions; an owner may end sessions of staff in the same company. */
export async function revokeSession(actor: Actor, sessionId: string): Promise<void> {
  assertNotImpersonating(actor);
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('user_sessions')
    .select('id, user_id, company_id')
    .eq('id', sessionId)
    .is('deleted_at', null)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const own = data.user_id === actor.userId;
  const ownerOfStaff =
    actor.role === 'owner' && actor.companyId !== null && data.company_id === actor.companyId;
  if (!own && !ownerOfStaff) throw new NotFoundError();
  const revoked = await admin.rpc('kd_revoke_session', {
    p_session: data.id,
    p_reason: own ? 'user_revoked' : 'owner_revoked',
  });
  if (revoked.error) throw new InternalError(revoked.error);
  await getService('audit').record({
    action: 'auth.session_revoked',
    resourceType: 'user_session',
    resourceId: data.id,
    metadata: { by_owner: !own },
  });
}

export async function revokeOtherSessions(actor: Actor): Promise<number> {
  assertNotImpersonating(actor);
  const { data: current } = await getAdminSupabase()
    .from('user_sessions')
    .select('auth_session_id')
    .eq('id', actor.sessionId)
    .maybeSingle();
  const { data, error } = await getAdminSupabase().rpc('kd_revoke_user_sessions', {
    p_user: actor.userId,
    p_except: current?.auth_session_id ?? null,
    p_reason: 'user_revoked_others',
  });
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'auth.sessions_revoked',
    resourceType: 'user',
    resourceId: actor.userId,
  });
  return typeof data === 'number' ? data : 0;
}

export async function changeOwnPassword(
  actor: Actor,
  input: z.infer<typeof passwordChangeSchema>,
): Promise<void> {
  assertNotImpersonating(actor);
  const identifier = await hashIdentifier(actor.email);
  if ((await checkLock(identifier)).locked) throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
  if (!(await verifyPassword(actor.email, input.currentPassword))) {
    await recordFailure(identifier, 'password', {
      userId: actor.userId,
      companyId: actor.companyId,
    });
    throw new UnauthorizedError(GENERIC_LOGIN_MESSAGE);
  }
  if (input.currentPassword === input.newPassword)
    throw new ValidationError('Choose a password you have not used before.');
  await enforcePasswordRules(input.newPassword, actor.email, actor.userId);
  const { data: current } = await getAdminSupabase()
    .from('user_sessions')
    .select('auth_session_id')
    .eq('id', actor.sessionId)
    .maybeSingle();
  await changePassword(
    actor.userId,
    actor.companyId,
    input.newPassword,
    current?.auth_session_id ?? null,
  );
  await recordLoginEvent({
    identifierHash: identifier,
    type: 'password_changed',
    userId: actor.userId,
    companyId: actor.companyId,
  });
  await getService('audit').record({
    action: 'auth.password_changed',
    resourceType: 'user',
    resourceId: actor.userId,
  });
  await tryGetService('email')?.send({
    template: 'auth.password-changed',
    to: actor.email,
    companyId: actor.companyId,
    data: { time: new Date().toISOString() },
    idempotencyKey: `pwchg-${randomHex(16)}`,
  });
}

export interface SecuritySummary {
  twoFactorActive: boolean;
  backupCodesLeft: number;
  canDisableTwoFactor: boolean;
}

export async function securitySummary(actor: Actor): Promise<SecuritySummary> {
  const active = await isTwoFactorActive(actor.userId);
  return {
    twoFactorActive: active,
    backupCodesLeft: active ? await remainingBackupCodes(actor.userId) : 0,
    canDisableTwoFactor: actor.role === 'owner',
  };
}

export function beginAccountEnrollment(actor: Actor): Promise<EnrollmentStart> {
  assertNotImpersonating(actor);
  return beginEnrollment(actor.userId, actor.companyId, actor.email);
}

export async function confirmAccountEnrollment(actor: Actor, code: string): Promise<string[]> {
  assertNotImpersonating(actor);
  const codes = await confirmEnrollment(actor.userId, actor.companyId, code);
  if (!codes) throw new ValidationError('The code is not correct.');
  await getService('audit').record({
    action: 'auth.two_factor_enabled',
    resourceType: 'user',
    resourceId: actor.userId,
  });
  return codes;
}

export async function regenerateCodes(actor: Actor): Promise<string[]> {
  assertNotImpersonating(actor);
  assertStepUp(actor);
  if (!(await isTwoFactorActive(actor.userId))) throw new ForbiddenError();
  const codes = await storeNewBackupCodes(actor.userId, actor.companyId);
  await getService('audit').record({
    action: 'auth.backup_codes_regenerated',
    resourceType: 'user',
    resourceId: actor.userId,
  });
  return codes;
}

/** Only an owner may turn 2FA off, with a fresh step-up. Staff and platform roles must keep it on. */
export async function disableOwnTwoFactor(actor: Actor): Promise<void> {
  assertNotImpersonating(actor);
  if (actor.role !== 'owner') throw new ForbiddenError();
  assertStepUp(actor);
  await disableTwoFactor(actor.userId);
  await getService('audit').record({
    action: 'auth.two_factor_disabled',
    resourceType: 'user',
    resourceId: actor.userId,
  });
}
