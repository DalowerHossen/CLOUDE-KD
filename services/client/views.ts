// path: services/client/views.ts
// Saved views: a named set of list filters that belongs to one person and one list.
import 'server-only';
import { getService } from '@/lib/container';
import { DuplicateError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { MAX_VIEWS } from '@/lib/crm/search';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface SavedView {
  id: string;
  listKey: string;
  name: string;
  filters: Record<string, string>;
}

export async function listViews(actor: Actor, listKey: string): Promise<SavedView[]> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase()
    .from('saved_views')
    .select('id, list_key, name, filters')
    .eq('company_id', actor.companyId)
    .eq('user_id', actor.userId)
    .eq('list_key', listKey)
    .is('deleted_at', null)
    .order('name');
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    listKey: String(r.list_key),
    name: String(r.name),
    filters: (r.filters ?? {}) as Record<string, string>,
  }));
}

export async function createView(
  actor: Actor,
  input: { listKey: string; name: string; filters: Record<string, string> },
): Promise<SavedView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const existing = await listViews(actor, input.listKey);
  if (existing.length >= MAX_VIEWS)
    throw new ValidationError(`You can save up to ${MAX_VIEWS} views.`);
  const { data, error } = await getAdminSupabase()
    .from('saved_views')
    .insert({
      company_id: actor.companyId,
      user_id: actor.userId,
      list_key: input.listKey,
      name: input.name,
      filters: input.filters,
    })
    .select('id, list_key, name, filters')
    .single();
  if (error) {
    if (error.code === '23505') throw new DuplicateError('You already have a view with this name.');
    throw new InternalError(error);
  }
  await getService('audit').record({
    action: 'view.saved',
    resourceType: 'saved_view',
    resourceId: String(data.id),
    companyId: actor.companyId,
    metadata: { listKey: input.listKey, by: actor.userId },
  });
  return {
    id: String(data.id),
    listKey: String(data.list_key),
    name: String(data.name),
    filters: (data.filters ?? {}) as Record<string, string>,
  };
}

export async function deleteView(actor: Actor, id: string): Promise<void> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const r = await getAdminSupabase()
    .from('saved_views')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', actor.companyId)
    .eq('user_id', actor.userId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'view.deleted',
    resourceType: 'saved_view',
    resourceId: id,
    companyId: actor.companyId,
    metadata: { by: actor.userId },
  });
}
