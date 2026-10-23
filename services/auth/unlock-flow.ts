// path: services/auth/unlock-flow.ts
// Unlock workflow (REQ-LOCK 4): an administrator requests the unlock, the system sends a one-time confirmation message
// to the registered e-mail address of the account, the account holder confirms it, and only then can the lock be lifted.
// Every stage writes an audit entry and a login event.
import 'server-only';
import { z } from 'zod';
import { UNLOCK_CONFIRMATION_TTL_SECONDS } from '@/config/auth-lock';
import { assertStepUp } from '@/lib/auth/step-up';
import { getService, tryGetService } from '@/lib/container';
import { getPublicEnv } from '@/lib/env/public';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { randomBase64Url, randomHex, sha256Hex } from '@/lib/utils/hash';
import { readRequestMeta } from '@/services/audit/request-meta';
import type { Actor } from '@/types/contracts';
import { hashIdentifier, unlockIdentifier } from './lock-service';
import { recordLoginEvent } from './login-events';

export const unlockRequestSchema = z
  .object({ userId: z.string().uuid(), reason: z.string().trim().min(3).max(1000) })
  .strict();
export const unlockConfirmSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/) })
  .strict();
export const unlockCompleteSchema = z.object({}).strict();

const lockRow = z
  .object({
    user_id: z.string().uuid().nullable(),
    company_id: z.string().uuid().nullable(),
    identifier_hash: z.string(),
    locked_until: z.string(),
    lock_started_at: z.string().nullable(),
    lock_reason: z.string().nullable(),
    lock_count: z.number().int(),
  })
  .strip();

export interface LockedAccount {
  userId: string;
  email: string;
  companyId: string | null;
  lockedUntil: string;
  lockStartedAt: string | null;
  reason: string | null;
  lockCount: number;
  pendingRequest: { id: string; status: string } | null;
}

export async function listLockedAccounts(): Promise<LockedAccount[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('auth_login_state')
    .select(
      'user_id, company_id, identifier_hash, locked_until, lock_started_at, lock_reason, lock_count',
    )
    .gt('locked_until', new Date().toISOString())
    .not('user_id', 'is', null)
    .is('deleted_at', null)
    .order('locked_until', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  const rows = z.array(lockRow).parse(data);
  const out: LockedAccount[] = [];
  for (const row of rows) {
    if (!row.user_id) continue;
    const profile = await admin
      .from('profiles')
      .select('email')
      .eq('user_id', row.user_id)
      .is('deleted_at', null)
      .maybeSingle();
    const request = await admin
      .from('auth_unlock_requests')
      .select('id, status')
      .eq('target_user_id', row.user_id)
      .in('status', ['pending_confirmation', 'confirmed'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    out.push({
      userId: row.user_id,
      email: profile.data?.email ? String(profile.data.email) : '',
      companyId: row.company_id,
      lockedUntil: row.locked_until,
      lockStartedAt: row.lock_started_at,
      reason: row.lock_reason,
      lockCount: row.lock_count,
      pendingRequest: request.data
        ? { id: String(request.data.id), status: String(request.data.status) }
        : null,
    });
  }
  return out;
}

export async function requestUnlock(
  actor: Actor,
  input: z.infer<typeof unlockRequestSchema>,
): Promise<{ id: string }> {
  assertStepUp(actor);
  if (actor.role !== 'super_admin' && actor.role !== 'ceo' && actor.role !== 'admin_staff')
    throw new NotFoundError();
  const admin = getAdminSupabase();
  const profile = await admin
    .from('profiles')
    .select('email, company_id')
    .eq('user_id', input.userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (profile.error) throw new InternalError(profile.error);
  if (!profile.data) throw new NotFoundError();
  const email = String(profile.data.email);
  const identifier = await hashIdentifier(email);
  const state = await admin
    .from('auth_login_state')
    .select('locked_until')
    .eq('identifier_hash', identifier)
    .is('deleted_at', null)
    .maybeSingle();
  if (state.error) throw new InternalError(state.error);
  if (!state.data?.locked_until || Date.parse(String(state.data.locked_until)) <= Date.now()) {
    throw new ConflictError('This account is not locked.');
  }
  const open = await admin
    .from('auth_unlock_requests')
    .select('id')
    .eq('target_user_id', input.userId)
    .in('status', ['pending_confirmation', 'confirmed'])
    .gt('expires_at', new Date().toISOString())
    .is('deleted_at', null)
    .maybeSingle();
  if (open.data) throw new ConflictError('An unlock request is already open for this account.');

  const token = randomBase64Url(32);
  const companyId = profile.data.company_id ? String(profile.data.company_id) : null;
  const created = await admin
    .from('auth_unlock_requests')
    .insert({
      company_id: companyId,
      target_user_id: input.userId,
      identifier_hash: identifier,
      requested_by: actor.userId,
      requested_by_role: actor.role,
      reason: input.reason,
      confirmation_token_hash: await sha256Hex(token),
      expires_at: new Date(Date.now() + UNLOCK_CONFIRMATION_TTL_SECONDS * 1000).toISOString(),
    })
    .select('id')
    .single();
  if (created.error) throw new InternalError(created.error);
  const id = String(created.data.id);
  const mail = tryGetService('email');
  if (!mail)
    throw new InternalError(
      new Error('The e-mail service is not available; the unlock cannot be confirmed.'),
    );
  await mail.send({
    template: 'auth.unlock-confirmation',
    to: email,
    companyId,
    data: { confirmUrl: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/unlock/confirm?t=${token}` },
    idempotencyKey: `unlock-${randomHex(16)}`,
  });
  await recordLoginEvent({
    identifierHash: identifier,
    type: 'unlock_requested',
    userId: input.userId,
    companyId,
    detail: { request: id },
  });
  await getService('audit').record({
    action: 'auth.unlock_requested',
    resourceType: 'unlock_request',
    resourceId: id,
    companyId,
    metadata: { target_user_id: input.userId, requested_by_role: actor.role, reason: input.reason },
  });
  return { id };
}

/** The account holder confirms with the one-time link from the e-mail. Public endpoint; answers the same for every failure. */
export async function confirmUnlock(token: string): Promise<boolean> {
  const admin = getAdminSupabase();
  const meta = await readRequestMeta();
  const { data, error } = await admin
    .from('auth_unlock_requests')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_ip_hash: meta.ipHash,
    })
    .eq('confirmation_token_hash', await sha256Hex(token))
    .eq('status', 'pending_confirmation')
    .gt('expires_at', new Date().toISOString())
    .is('deleted_at', null)
    .select('id, target_user_id, identifier_hash, company_id');
  if (error) throw new InternalError(error);
  const row = data?.[0];
  if (!row) return false;
  await recordLoginEvent({
    identifierHash: String(row.identifier_hash),
    type: 'unlock_confirmed',
    userId: String(row.target_user_id),
    companyId: row.company_id ? String(row.company_id) : null,
  });
  await getService('audit').record({
    action: 'auth.unlock_confirmed',
    resourceType: 'unlock_request',
    resourceId: String(row.id),
    companyId: row.company_id ? String(row.company_id) : null,
    metadata: { evidence: 'one-time e-mail link used', ip_hash_stored: meta.ipHash !== null },
  });
  return true;
}

export async function completeUnlock(actor: Actor, requestId: string): Promise<void> {
  assertStepUp(actor);
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('auth_unlock_requests')
    .select(
      'id, status, target_user_id, identifier_hash, company_id, expires_at, requested_by, confirmed_at',
    )
    .eq('id', requestId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  if (data.status !== 'confirmed' || !data.confirmed_at) {
    throw new ValidationError('The account holder has not confirmed the unlock yet.');
  }
  if (Date.parse(String(data.expires_at)) <= Date.now())
    throw new ConflictError('This unlock request expired.');
  const updated = await admin
    .from('auth_unlock_requests')
    .update({
      status: 'unlocked',
      unlocked_by: actor.userId,
      unlocked_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'confirmed')
    .select('id');
  if (updated.error) throw new InternalError(updated.error);
  if ((updated.data ?? []).length !== 1)
    throw new ConflictError('This request was already handled.');
  await unlockIdentifier(String(data.identifier_hash));
  const companyId = data.company_id ? String(data.company_id) : null;
  await recordLoginEvent({
    identifierHash: String(data.identifier_hash),
    type: 'unlock_completed',
    userId: String(data.target_user_id),
    companyId,
  });
  await tryGetService('events')?.publish({
    name: 'auth.account_unlocked',
    companyId,
    payload: { userId: String(data.target_user_id), requestId },
  });
  await getService('audit').record({
    action: 'auth.account_unlocked',
    resourceType: 'unlock_request',
    resourceId: requestId,
    companyId,
    metadata: {
      target_user_id: String(data.target_user_id),
      unlocked_by_role: actor.role,
      requested_by: String(data.requested_by),
    },
  });
}
