// path: services/social/approvals.ts
// Approval of social posts. When the company asks for approval, a post is sent for approval (a draft the writer finishes, or a post
// made by a schedule, a rule or the evergreen queue), the owner approves or refuses it through the approval service, and the
// publishing code only sends approved posts. If the company set a number of hours and nobody answers, the post is approved by
// itself (cron). Every step is added to the history of the post, which never changes.
import 'server-only';
import { AUTO_APPROVE_BATCH } from '@/config/s16-social';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { decisionInput } from '@/lib/social/schedule';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record } from './db';
import { getSettings } from './settings';

const log = createLogger({ service: 'social-approvals' });
export const SOCIAL_APPROVAL_ACTION = 'social.post.publish';

export type ApprovalEvent = 'submitted' | 'approved' | 'rejected' | 'auto_approved' | 'withdrawn';

export async function addApprovalEvent(
  companyId: string,
  postId: string,
  event: ApprovalEvent,
  actorId: string | null,
  reason: string | null,
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('social_post_approvals')
    .insert({
      company_id: companyId,
      post_id: postId,
      event,
      actor_id: actorId,
      reason: reason === null ? null : reason.slice(0, 300),
    });
  if (error) throw new InternalError(error);
}

/** Does this post still need an approval before it may go out? */
export async function approvalMissing(
  companyId: string,
  post: { approvalStatus: string },
): Promise<boolean> {
  if (post.approvalStatus === 'approved') return false;
  return (await getSettings(companyId)).approvalRequired;
}

interface PostRow {
  id: string;
  status: string;
  approval_status: string;
  approval_request_id: string | null;
  version: number;
}

async function rowOf(companyId: string, id: string): Promise<PostRow> {
  const { data, error } = await getAdminSupabase()
    .from('social_posts')
    .select('id, status, approval_status, approval_request_id, version')
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as PostRow;
}

/** Sends a post for approval. `requesterId` is the writer (null for work done by a schedule without an author). */
export async function submitPost(
  companyId: string,
  postId: string,
  requesterId: string | null,
): Promise<void> {
  const row = await rowOf(companyId, postId);
  if (row.status !== 'draft' && row.status !== 'scheduled' && row.status !== 'failed')
    throw new ConflictError('This post can no longer be sent for approval.');
  if (row.approval_status === 'pending') return;
  if (row.approval_status === 'approved') throw new ConflictError('This post is already approved.');
  let requestId: string | null = null;
  if (requesterId !== null) {
    const state = await getService('approval').request({
      action: SOCIAL_APPROVAL_ACTION,
      payload: { postId },
      requesterId,
      companyId,
    });
    requestId = state.requestId;
  }
  const { data, error } = await getAdminSupabase()
    .from('social_posts')
    .update({
      approval_status: 'pending',
      approval_requested_at: new Date().toISOString(),
      approval_decided_at: null,
      approval_decided_by: null,
      approval_reason: null,
      approval_request_id: requestId,
    })
    .eq('company_id', companyId)
    .eq('id', postId)
    .in('approval_status', ['none', 'rejected'])
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0) throw new ConflictError('The post changed. Reload and try again.');
  await addApprovalEvent(companyId, postId, 'submitted', requesterId, null);
  await record(companyId, 'social.post_submitted', 'social_post', postId, {});
}

export async function submitPostAs(actor: Actor, postId: string): Promise<void> {
  await submitPost(need(actor), postId, actor.userId);
}

/** If the company asks for approval and the post is not approved or waiting, sends it. Returns whether it was sent. */
export async function submitIfRequired(
  companyId: string,
  postId: string,
  requesterId: string | null,
): Promise<boolean> {
  if (!(await getSettings(companyId)).approvalRequired) return false;
  const row = await rowOf(companyId, postId);
  if (row.approval_status !== 'none') return false;
  await submitPost(companyId, postId, requesterId);
  return true;
}

/** The owner approves or refuses a post that waits. A refused post goes back to a draft. */
export async function decidePost(actor: Actor, postId: string, input: unknown): Promise<void> {
  const companyId = need(actor);
  if (actor.role === 'staff') throw new ForbiddenError();
  const parsed = decisionInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The decision is not valid.');
  const d = parsed.data;
  const row = await rowOf(companyId, postId);
  if (row.approval_status !== 'pending')
    throw new ConflictError('This post is not waiting for a decision.');
  if (row.approval_request_id)
    await getService('approval').decide(row.approval_request_id, {
      approverId: actor.userId,
      decision: d.decision,
      reason: d.reason || null,
    });
  const approve = d.decision === 'approve';
  const { data, error } = await getAdminSupabase()
    .from('social_posts')
    .update({
      approval_status: approve ? 'approved' : 'rejected',
      approval_decided_at: new Date().toISOString(),
      approval_decided_by: actor.userId,
      approval_reason: d.reason || null,
      ...(approve ? {} : { status: 'draft' }),
    })
    .eq('company_id', companyId)
    .eq('id', postId)
    .eq('approval_status', 'pending')
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0) throw new ConflictError('Someone else decided this post.');
  await addApprovalEvent(
    companyId,
    postId,
    approve ? 'approved' : 'rejected',
    actor.userId,
    d.reason || null,
  );
  await record(
    companyId,
    approve ? 'social.post_approved' : 'social.post_rejected',
    'social_post',
    postId,
    {
      reason: d.reason,
    },
  );
}

export interface PendingPost {
  id: string;
  body: string;
  accountName: string;
  scheduledAt: string | null;
  requestedAt: string | null;
  autoApprovesAt: string | null;
}

export async function listPending(companyId: string): Promise<PendingPost[]> {
  const settings = await getSettings(companyId);
  const { data, error } = await getAdminSupabase()
    .from('social_posts')
    .select('id, body, scheduled_at, approval_requested_at, social_accounts(display_name)')
    .eq('company_id', companyId)
    .eq('approval_status', 'pending')
    .is('deleted_at', null)
    .order('approval_requested_at', { ascending: true })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => {
    const acc = r.social_accounts as { display_name?: string } | { display_name?: string }[] | null;
    const requested = r.approval_requested_at === null ? null : String(r.approval_requested_at);
    return {
      id: String(r.id),
      body: String(r.body),
      accountName: String((Array.isArray(acc) ? acc[0] : acc)?.display_name ?? ''),
      scheduledAt: r.scheduled_at === null ? null : String(r.scheduled_at),
      requestedAt: requested,
      autoApprovesAt:
        requested !== null && settings.approvalSlaHours !== null
          ? new Date(Date.parse(requested) + settings.approvalSlaHours * 3_600_000).toISOString()
          : null,
    };
  });
}

export interface HistoryItem {
  event: ApprovalEvent;
  actorId: string | null;
  reason: string | null;
  at: string;
}

export async function historyOf(companyId: string, postId: string): Promise<HistoryItem[]> {
  const { data, error } = await getAdminSupabase()
    .from('social_post_approvals')
    .select('event, actor_id, reason, created_at')
    .eq('company_id', companyId)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    event: r.event as ApprovalEvent,
    actorId: r.actor_id === null ? null : String(r.actor_id),
    reason: r.reason === null ? null : String(r.reason),
    at: String(r.created_at),
  }));
}

/** Cron: a post nobody answered within the hours of the company is approved by itself. */
export async function runAutoApprove(): Promise<{ approved: number }> {
  const admin = getAdminSupabase();
  const { data: companies, error } = await admin
    .from('social_settings')
    .select('company_id, approval_sla_hours')
    .eq('approval_required', true)
    .not('approval_sla_hours', 'is', null)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  let approved = 0;
  for (const c of companies ?? []) {
    const companyId = String(c.company_id);
    const cutoff = new Date(Date.now() - Number(c.approval_sla_hours) * 3_600_000).toISOString();
    const due = await admin
      .from('social_posts')
      .select('id, approval_request_id')
      .eq('company_id', companyId)
      .eq('approval_status', 'pending')
      .lte('approval_requested_at', cutoff)
      .is('deleted_at', null)
      .limit(AUTO_APPROVE_BATCH);
    if (due.error) throw new InternalError(due.error);
    for (const p of due.data ?? []) {
      try {
        const done = await admin
          .from('social_posts')
          .update({
            approval_status: 'approved',
            approval_decided_at: new Date().toISOString(),
            approval_reason: 'Approved automatically: nobody answered in time.',
          })
          .eq('id', String(p.id))
          .eq('approval_status', 'pending')
          .select('id');
        if (done.error) throw new InternalError(done.error);
        if ((done.data ?? []).length === 0) continue;
        await addApprovalEvent(companyId, String(p.id), 'auto_approved', null, null);
        await record(companyId, 'social.post_auto_approved', 'social_post', String(p.id), {});
        approved += 1;
      } catch (e) {
        log.error('auto approval failed', { postId: String(p.id), error: e });
      }
    }
  }
  return { approved };
}
