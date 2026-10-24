// path: services/approval/solo-mode.ts
// Solo approval mode: a super_admin may approve the own request. Global flag, changed by super_admin only.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const FLAG = 'approval.solo_mode';

export async function isSoloMode(): Promise<boolean> {
  const { data, error } = await getAdminSupabase()
    .from('feature_flags')
    .select('enabled')
    .eq('key', FLAG)
    .is('company_id', null)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data?.enabled === true;
}

export async function setSoloMode(actor: Actor, enabled: boolean): Promise<void> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('feature_flags')
    .select('id, version')
    .eq('key', FLAG)
    .is('company_id', null)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  const write = data
    ? await admin
        .from('feature_flags')
        .update({ enabled })
        .eq('id', data.id)
        .eq('version', data.version)
    : await admin.from('feature_flags').insert({ key: FLAG, enabled });
  if (write.error) throw new InternalError(write.error);
  await getService('audit').record({
    action: 'approval.solo_mode_changed',
    resourceType: 'feature_flag',
    resourceId: null,
    companyId: null,
    metadata: { enabled },
  });
}
