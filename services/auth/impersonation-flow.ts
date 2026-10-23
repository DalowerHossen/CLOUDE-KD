// path: services/auth/impersonation-flow.ts
// Support impersonation: super_admin only, fresh step-up, one hour at most, banner everywhere, every action in the
// audit log carries the administrator id. Ending the session signs the browser out; the administrator signs in again.
import 'server-only';
import { z } from 'zod';
import { assertStepUp } from '@/lib/auth/step-up';
import { checkImpersonation, impersonationEnd } from '@/lib/auth/impersonation';
import { getService, tryGetService } from '@/lib/container';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Actor } from '@/types/contracts';
import { currentActor } from './actor';
import { lookupUserByEmail, mintSession } from './credentials';
import { hashIdentifier } from './lock-service';
import { recordLoginEvent } from './login-events';
import { openSessionRecord } from './session-service';

export const impersonationStartSchema = z
  .object({
    targetEmail: z.string().trim().toLowerCase().email().max(254),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();

export function assertNotImpersonating(actor: Actor): void {
  if (actor.impersonatedBy !== null)
    throw new ForbiddenError('This is not available while you act as another user.');
}

export async function startImpersonation(
  actor: Actor,
  input: z.infer<typeof impersonationStartSchema>,
): Promise<{ id: string; endsAt: string }> {
  assertNotImpersonating(actor);
  let fresh = true;
  try {
    assertStepUp(actor);
  } catch {
    fresh = false;
  }
  const target = await lookupUserByEmail(input.targetEmail);
  const verdict = checkImpersonation({
    actorRole: actor.role,
    actorId: actor.userId,
    targetRole: target?.role ?? null,
    targetId: target?.userId ?? '',
    targetActive: target?.active ?? false,
    stepUpFresh: fresh,
  });
  if (verdict === 'no_step_up') assertStepUp(actor);
  if (verdict === 'not_super_admin') throw new NotFoundError();
  if (verdict !== 'ok' || !target) throw new ValidationError('This user cannot be impersonated.');

  const admin = getAdminSupabase();
  const endsAt = impersonationEnd(new Date());
  const created = await admin
    .from('impersonation_sessions')
    .insert({
      company_id: target.companyId,
      admin_user_id: actor.userId,
      target_user_id: target.userId,
      reason: input.reason,
      step_up_at: actor.lastStepUpAt,
      expires_at: endsAt.toISOString(),
    })
    .select('id')
    .single();
  if (created.error) throw new InternalError(created.error);
  const id = String(created.data.id);
  // The audit entry is written while the actor is still the administrator.
  await getService('audit').record({
    action: 'auth.impersonation_started',
    resourceType: 'impersonation_session',
    resourceId: id,
    companyId: target.companyId,
    metadata: {
      target_user_id: target.userId,
      reason_length: input.reason.length,
      ends_at: endsAt.toISOString(),
    },
  });
  const identifier = await hashIdentifier(input.targetEmail);
  const minted = await mintSession(input.targetEmail);
  await openSessionRecord({
    userId: target.userId,
    email: input.targetEmail,
    companyId: target.companyId,
    authSessionId: minted.authSessionId,
    identifier,
    rememberMe: false,
    aal: 'aal1',
    impersonatedBy: actor.userId,
    expiresAt: endsAt,
    quiet: true,
  });
  await recordLoginEvent({
    identifierHash: identifier,
    type: 'impersonation_started',
    userId: target.userId,
    companyId: target.companyId,
    detail: { by: actor.userId, id },
  });
  await tryGetService('security')?.raiseSecurityEvent('other', {
    reason: 'impersonation_started',
    by: actor.userId,
    target: target.userId,
  });
  return { id, endsAt: endsAt.toISOString() };
}

export async function endImpersonation(): Promise<{ ended: boolean }> {
  const actor = await currentActor();
  if (!actor) throw new UnauthorizedError();
  if (!actor.impersonatedBy) throw new ForbiddenError();
  const admin = getAdminSupabase();
  await admin
    .from('impersonation_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('admin_user_id', actor.impersonatedBy)
    .eq('target_user_id', actor.userId)
    .is('ended_at', null);
  await getService('audit').record({
    action: 'auth.impersonation_ended',
    resourceType: 'impersonation_session',
    resourceId: null,
    metadata: { target_user_id: actor.userId },
  });
  await admin.rpc('kd_revoke_session', {
    p_session: actor.sessionId,
    p_reason: 'impersonation_ended',
  });
  await (await createServerSupabase()).auth.signOut({ scope: 'local' });
  return { ended: true };
}

export interface ImpersonationItem {
  id: string;
  adminUserId: string;
  targetUserId: string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
}

export async function listImpersonations(): Promise<ImpersonationItem[]> {
  const { data, error } = await getAdminSupabase()
    .from('impersonation_sessions')
    .select('id, admin_user_id, target_user_id, started_at, expires_at, ended_at')
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return z
    .array(
      z
        .object({
          id: z.string().uuid(),
          admin_user_id: z.string().uuid(),
          target_user_id: z.string().uuid(),
          started_at: z.string(),
          expires_at: z.string(),
          ended_at: z.string().nullable(),
        })
        .strip(),
    )
    .parse(data)
    .map((r) => ({
      id: r.id,
      adminUserId: r.admin_user_id,
      targetUserId: r.target_user_id,
      startedAt: r.started_at,
      expiresAt: r.expires_at,
      endedAt: r.ended_at,
    }));
}
