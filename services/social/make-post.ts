// path: services/social/make-post.ts
// One way to put a post into the table for the work that is done without a person at the keyboard (schedules, rules and the
// evergreen queue). The post starts as a draft or scheduled; when the company asks for approval, a scheduled post is sent for it.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { submitIfRequired } from './approvals';

export interface MadePost {
  companyId: string;
  accountId: string;
  body: string;
  linkUrl: string | null;
  imageUrl: string | null;
  scheduledAt: string | null;
  createdBy: string | null;
  scheduleId?: string;
  scheduleSlot?: string;
  ruleId?: string;
  evergreenItemId?: string;
}

/** Inserts the post. Returns its id, or null when it exists already (the same schedule slot). */
export async function makePost(p: MadePost): Promise<string | null> {
  const { data, error } = await getAdminSupabase()
    .from('social_posts')
    .insert({
      company_id: p.companyId,
      account_id: p.accountId,
      body: p.body,
      link_url: p.linkUrl,
      image_url: p.imageUrl,
      status: p.scheduledAt === null ? 'draft' : 'scheduled',
      scheduled_at: p.scheduledAt,
      created_by: p.createdBy,
      ...(p.scheduleId ? { schedule_id: p.scheduleId, schedule_slot: p.scheduleSlot ?? null } : {}),
      ...(p.ruleId ? { rule_id: p.ruleId } : {}),
      ...(p.evergreenItemId ? { evergreen_item_id: p.evergreenItemId } : {}),
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return null;
    throw new InternalError(error);
  }
  const id = String(data.id);
  if (p.scheduledAt !== null) await submitIfRequired(p.companyId, id, p.createdBy);
  return id;
}
