// path: services/client/activity.ts
// The client timeline: notes, calls, meetings and e-mails written here, system entries (archive, merge, anonymize),
// and the entries other STEPs add through registered providers (invoices, payments, estimates, e-mails).
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { clientTimelineProviders, type TimelineEntry } from '@/lib/crm/hooks';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { getClient } from './clients';

export interface ActivityItem extends TimelineEntry {
  id: string | null;
  author: string;
}

/** Writes a system entry for a client (no actor needed). Never fails the caller. */
export async function logClientEvent(
  companyId: string,
  clientId: string,
  kind: 'status' | 'merge' | 'system',
  title: string,
  body: string,
  by: string | null,
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('client_activity')
    .insert({ company_id: companyId, client_id: clientId, kind, title, body, created_by: by });
  if (error) throw new InternalError(error);
}

export async function addActivity(
  actor: Actor,
  clientId: string,
  input: { kind: 'note' | 'call' | 'meeting' | 'email'; title: string; body: string },
): Promise<void> {
  const companyId = actor.companyId as string;
  await getClient(companyId, clientId);
  const { data, error } = await getAdminSupabase()
    .from('client_activity')
    .insert({ company_id: companyId, client_id: clientId, created_by: actor.userId, ...input })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'client.activity_added',
    resourceType: 'client',
    resourceId: clientId,
    companyId,
    metadata: { kind: input.kind, entry: String(data.id), by: actor.userId },
  });
}

export async function timeline(
  companyId: string,
  clientId: string,
  limit = 50,
): Promise<ActivityItem[]> {
  await getClient(companyId, clientId);
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('client_activity')
    .select('id, kind, title, body, created_by, created_at')
    .eq('company_id', companyId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new InternalError(error);
  const authors = [
    ...new Set((data ?? []).flatMap((r) => (r.created_by ? [String(r.created_by)] : []))),
  ];
  const names = new Map<string, string>();
  if (authors.length > 0) {
    const p = await admin
      .from('profiles')
      .select('user_id, full_name, email')
      .in('user_id', authors);
    for (const x of p.data ?? [])
      names.set(String(x.user_id), String(x.full_name) || String(x.email));
  }
  const own: ActivityItem[] = (data ?? []).map((r) => ({
    id: String(r.id),
    at: String(r.created_at),
    kind: String(r.kind),
    title: String(r.title),
    detail: String(r.body),
    href: null,
    author: r.created_by ? (names.get(String(r.created_by)) ?? '') : '',
  }));
  const external: ActivityItem[] = [];
  for (const provider of clientTimelineProviders()) {
    const entries = await provider(companyId, clientId, limit).catch(() => []);
    for (const e of entries) external.push({ ...e, id: null, author: '' });
  }
  return [...own, ...external].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
