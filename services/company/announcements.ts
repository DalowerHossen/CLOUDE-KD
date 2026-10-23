// path: services/company/announcements.ts
// Platform announcements (planned maintenance, notices) shown to companies while they are live.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError } from '@/lib/errors';
import type { AnnouncementAction } from '@/lib/company/ops-input';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  kind: 'info' | 'maintenance' | 'warning';
  audience: 'all' | 'owners';
  startsAt: string;
  endsAt: string;
  status: 'published' | 'withdrawn';
}

const COLUMNS = 'id, title, body, kind, audience, starts_at, ends_at, status';
const view = (r: Record<string, unknown>): AnnouncementView => ({
  id: String(r.id),
  title: String(r.title),
  body: String(r.body),
  kind: String(r.kind) as AnnouncementView['kind'],
  audience: String(r.audience) as AnnouncementView['audience'],
  startsAt: String(r.starts_at),
  endsAt: String(r.ends_at),
  status: String(r.status) as AnnouncementView['status'],
});

/** Everything, newest first, for the platform screen. */
export async function listAll(): Promise<AnnouncementView[]> {
  const { data, error } = await getAdminSupabase()
    .from('announcements')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('starts_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map(view);
}

/** The announcements a company user sees now. Staff do not see notices meant for owners. */
export async function listLive(role: string): Promise<AnnouncementView[]> {
  const now = new Date().toISOString();
  let q = getAdminSupabase()
    .from('announcements')
    .select(COLUMNS)
    .eq('status', 'published')
    .is('deleted_at', null)
    .lte('starts_at', now)
    .gt('ends_at', now)
    .order('starts_at', { ascending: false })
    .limit(10);
  if (role !== 'owner') q = q.eq('audience', 'all');
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return (data ?? []).map(view);
}

export async function runAnnouncementAction(
  actor: Actor,
  input: AnnouncementAction,
): Promise<{ result: 'done' }> {
  if (actor.role !== 'super_admin' && actor.role !== 'ceo') throw new ForbiddenError();
  const admin = getAdminSupabase();
  if (input.action === 'publish') {
    const { data, error } = await admin
      .from('announcements')
      .insert({
        title: input.title,
        body: input.body,
        kind: input.kind,
        audience: input.audience,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        created_by: actor.userId,
      })
      .select('id')
      .single();
    if (error) throw new InternalError(error);
    await getService('audit').record({
      action: 'announcement.published',
      resourceType: 'announcement',
      resourceId: String(data.id),
      companyId: null,
      metadata: { kind: input.kind, audience: input.audience, by: actor.userId },
    });
    return { result: 'done' };
  }
  const r = await admin
    .from('announcements')
    .update({ status: 'withdrawn' })
    .eq('id', input.id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'announcement.withdrawn',
    resourceType: 'announcement',
    resourceId: input.id,
    companyId: null,
    metadata: { by: actor.userId },
  });
  return { result: 'done' };
}
