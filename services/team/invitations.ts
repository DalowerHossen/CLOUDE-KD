// path: services/team/invitations.ts
// Staff invitations: create, send, send again, cancel, list and accept. The link carries a random token; only its
// hash is stored, a token works once and ends after 7 days. Accepting creates the person's account and membership.
import 'server-only';
import { z } from 'zod';
import { enforcePasswordRules, disposableCheck } from '@/services/auth/password-service';
import { lookupUserByEmail } from '@/services/auth/credentials';
import { getService, tryGetService } from '@/lib/container';
import { DuplicateError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { permissions as registered } from '@/config/permissions';
import { validateStaffGrants } from '@/lib/auth/permissions';
import { getPublicEnv } from '@/lib/env/public';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { base64UrlEncode, randomBytes, sha256Hex } from '@/lib/utils/hash';
import { expandPreset } from '@/lib/team/presets';
import type { Actor } from '@/types/contracts';
import { seatState } from './members';

const log = createLogger({ component: 'team-invitations' });
export const INVITATION_DAYS = 7;
const DAY = 86_400_000;

export const inviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    preset: z
      .string()
      .regex(/^[a-z_]{2,30}$/)
      .default('custom'),
    grants: z.array(z.string().max(100)).max(100).default([]),
  })
  .strict();
export const invitationActionSchema = z
  .object({ action: z.enum(['resend', 'cancel']), id: z.string().uuid() })
  .strict();
export const acceptSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{40,60}$/),
    fullName: z.string().trim().min(1).max(200),
    password: z.string().min(1).max(256),
    turnstileToken: z.string().min(1).max(4096),
    website: z.string().max(200).default(''),
  })
  .strict();

export interface InvitationView {
  id: string;
  email: string;
  preset: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  expiresAt: string;
  sendCount: number;
  createdAt: string;
}

function newToken(): string {
  return base64UrlEncode(randomBytes(32));
}

async function sendInvitation(
  actor: Actor,
  companyId: string,
  email: string,
  token: string,
  expiresAt: string,
): Promise<void> {
  const mail = tryGetService('email');
  if (!mail) return;
  const { data } = await getAdminSupabase()
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  await mail.send({
    template: 'auth.team-invitation',
    to: email,
    companyId,
    data: {
      inviterName: actor.email,
      companyName: String(data?.name ?? 'your team'),
      acceptUrl: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/join?token=${encodeURIComponent(token)}`,
      expiresOn: expiresAt.slice(0, 10),
    },
    idempotencyKey: `invite-${(await sha256Hex(token)).slice(0, 24)}`,
  });
}

export async function listInvitations(companyId: string): Promise<InvitationView[]> {
  const { data, error } = await getAdminSupabase()
    .from('team_invitations')
    .select('id, email, preset, status, expires_at, send_count, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    email: String(r.email),
    preset: String(r.preset),
    status:
      r.status === 'pending' && Date.parse(String(r.expires_at)) <= Date.now()
        ? 'expired'
        : (String(r.status) as InvitationView['status']),
    expiresAt: String(r.expires_at),
    sendCount: Number(r.send_count),
    createdAt: String(r.created_at),
  }));
}

export async function createInvitation(
  actor: Actor,
  input: z.infer<typeof inviteSchema>,
): Promise<InvitationView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const grants =
    input.preset !== 'custom' && input.grants.length === 0
      ? expandPreset(input.preset, registered)
      : input.grants;
  const check = validateStaffGrants(grants);
  if (!check.ok)
    throw new ValidationError(
      'Some permissions cannot be given to staff.',
      check.rejected.map((g) => ({ path: 'grants', message: g })),
    );
  const seats = await seatState(companyId);
  if (seats.limit !== null && seats.used >= seats.limit)
    throw new ValidationError(
      'Your plan has no free seat. Upgrade the plan or remove a person first.',
    );
  // An address that already has an account is refused with the same words for every case, so the answer shows nothing.
  if (await lookupUserByEmail(input.email))
    throw new ValidationError('This address cannot be invited.');
  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * DAY).toISOString();
  const { data, error } = await getAdminSupabase()
    .from('team_invitations')
    .insert({
      company_id: companyId,
      email: input.email,
      preset: input.preset,
      granted_permissions: grants,
      token_hash: await sha256Hex(token),
      expires_at: expiresAt,
      invited_by: actor.userId,
    })
    .select('id, email, preset, status, expires_at, send_count, created_at')
    .single();
  if (error) {
    if (error.code === '23505')
      throw new DuplicateError('This address already has an open invitation.');
    throw new InternalError(error);
  }
  await sendInvitation(actor, companyId, input.email, token, expiresAt);
  await getService('audit').record({
    action: 'team.invited',
    resourceType: 'team_invitation',
    resourceId: String(data.id),
    companyId,
    metadata: { preset: input.preset, grants: grants.length, by: actor.userId },
  });
  return {
    id: String(data.id),
    email: String(data.email),
    preset: String(data.preset),
    status: 'pending',
    expiresAt: String(data.expires_at),
    sendCount: 1,
    createdAt: String(data.created_at),
  };
}

export async function runInvitationAction(
  actor: Actor,
  input: z.infer<typeof invitationActionSchema>,
): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const found = await admin
    .from('team_invitations')
    .select('id, email, status, send_count, version')
    .eq('id', input.id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (!found.data || found.data.status !== 'pending') throw new NotFoundError();
  if (input.action === 'cancel') {
    const r = await admin
      .from('team_invitations')
      .update({ status: 'cancelled' })
      .eq('id', input.id)
      .eq('status', 'pending');
    if (r.error) throw new InternalError(r.error);
  } else {
    if (Number(found.data.send_count) >= 5)
      throw new ValidationError(
        'This invitation was sent the most times allowed. Cancel it and invite again.',
      );
    const token = newToken();
    const expiresAt = new Date(Date.now() + INVITATION_DAYS * DAY).toISOString();
    const r = await admin
      .from('team_invitations')
      .update({
        token_hash: await sha256Hex(token),
        expires_at: expiresAt,
        send_count: Number(found.data.send_count) + 1,
        last_sent_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .eq('status', 'pending');
    if (r.error) throw new InternalError(r.error);
    await sendInvitation(actor, companyId, String(found.data.email), token, expiresAt);
  }
  await getService('audit').record({
    action: `team.invitation_${input.action === 'cancel' ? 'cancelled' : 'resent'}`,
    resourceType: 'team_invitation',
    resourceId: input.id,
    companyId,
    metadata: { by: actor.userId },
  });
}

/** What the join page shows for a token: the company name and the address, or nothing. */
export async function peekInvitation(
  token: string,
): Promise<{ email: string; companyName: string } | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const { data, error } = await getAdminSupabase().rpc('kd_invitation_peek', {
    p_hash: await sha256Hex(token),
  });
  if (error) throw new InternalError(error);
  const row = Array.isArray(data) ? data[0] : null;
  return row ? { email: String(row.email), companyName: String(row.company_name) } : null;
}

/** Public: turns an invitation into an account. Every refusal answers the same words. */
export async function acceptInvitation(
  input: z.infer<typeof acceptSchema>,
  ip: string,
): Promise<void> {
  if (input.website.trim() !== '') return;
  const refuse = (): never => {
    throw new ValidationError('This invitation is not valid any more. Ask for a new one.');
  };
  if (!(await getService('security').verifyTurnstile(input.turnstileToken, ip)))
    throw new ValidationError('Please complete the security check.');
  const invitation = await peekInvitation(input.token);
  if (!invitation) return refuse();
  disposableCheck(invitation.email);
  await enforcePasswordRules(input.password, invitation.email);
  const admin = getAdminSupabase();
  const created = await admin.auth.admin.createUser({
    email: invitation.email,
    password: input.password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) return refuse();
  const userId = created.data.user.id;
  try {
    const hash = await sha256Hex(input.token);
    const peek = await admin.rpc('kd_invitation_peek', { p_hash: hash });
    const companyId =
      Array.isArray(peek.data) && peek.data[0] ? String(peek.data[0].company_id) : null;
    if (!companyId) throw new Error('invitation gone');
    const accepted = await admin.rpc('kd_invitation_accept', {
      p_hash: hash,
      p_user: userId,
      p_name: input.fullName,
    });
    if (accepted.error) throw new Error('accept');
    await getService('audit').record({
      action: 'team.invitation_accepted',
      resourceType: 'user',
      resourceId: userId,
      companyId,
      metadata: {},
    });
    await getService('notification')
      .notify({
        companyId,
        type: 'team.joined',
        title: 'A team member joined',
        body: `${input.fullName} accepted the invitation.`,
      })
      .catch(() => undefined);
  } catch (error) {
    log.warn('invitation could not be completed; the new account is removed', {
      error: error instanceof Error ? error.message : 'failed',
    });
    await admin.auth.admin.deleteUser(userId);
    return refuse();
  }
}
