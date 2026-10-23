// path: services/social/hashtags.ts
// Saved groups of hashtags that the composer adds to a post.
import 'server-only';
import { MAX_HASHTAG_GROUPS } from '@/config/s16-social';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { hashtagGroupInput, normaliseTag } from '@/lib/social/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record } from './db';

export interface HashtagGroupView {
  id: string;
  name: string;
  tags: string[];
}

export async function listGroups(companyId: string): Promise<HashtagGroupView[]> {
  const { data, error } = await getAdminSupabase()
    .from('social_hashtag_groups')
    .select('id, name, tags')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(200);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    tags: (r.tags as string[]).map(String),
  }));
}

export async function getGroup(companyId: string, id: string): Promise<HashtagGroupView> {
  const found = (await listGroups(companyId)).find((g) => g.id === id);
  if (!found) throw new NotFoundError();
  return found;
}

export async function createGroup(actor: Actor, input: unknown): Promise<HashtagGroupView> {
  const companyId = need(actor);
  const parsed = hashtagGroupInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The group is not valid.');
  if ((await listGroups(companyId)).length >= MAX_HASHTAG_GROUPS)
    throw new ConflictError(`A company can save ${MAX_HASHTAG_GROUPS} hashtag groups at most.`);
  const tags = [...new Set(parsed.data.tags.map(normaliseTag))];
  const { data, error } = await getAdminSupabase()
    .from('social_hashtag_groups')
    .insert({ company_id: companyId, name: parsed.data.name, tags })
    .select('id, name, tags')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('A group with this name exists.');
    mapIntegrationError(error);
  }
  const g = data as unknown as { id: string; name: string; tags: string[] };
  await record(companyId, 'social.hashtag_group_created', 'social_hashtag_group', g.id, {
    name: g.name,
  });
  return { id: String(g.id), name: String(g.name), tags: g.tags.map(String) };
}

export async function deleteGroup(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  await getGroup(companyId, id);
  const { error } = await getAdminSupabase()
    .from('social_hashtag_groups')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'social.hashtag_group_removed', 'social_hashtag_group', id, {});
}
