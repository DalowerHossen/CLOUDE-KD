// path: services/client/merge.ts
// Merging two clients into one. Other STEPs move their own records through the registered merge handlers first
// (they point at the kept client afterwards); then one database step combines the two records and keeps a snapshot.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import { clientMergeHandlers } from '@/lib/crm/hooks';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { getClient } from './clients';

export async function mergeClients(actor: Actor, keepId: string, removeId: string): Promise<void> {
  const companyId = actor.companyId as string;
  const [keep, remove] = await Promise.all([
    getClient(companyId, keepId),
    getClient(companyId, removeId),
  ]);
  if (keep.anonymized || remove.anonymized)
    throw new ValidationError('An anonymized client cannot be merged.');
  for (const handler of clientMergeHandlers()) await handler(companyId, removeId, keepId);
  const r = await getAdminSupabase().rpc('kd_client_merge', {
    p_company: companyId,
    p_keep: keepId,
    p_remove: removeId,
    p_by: actor.userId,
  });
  if (r.error) {
    if (r.error.code === '22023') throw new ValidationError('These clients cannot be merged.');
    throw new InternalError(r.error);
  }
  await getService('audit').record({
    action: 'client.merged',
    resourceType: 'client',
    resourceId: keepId,
    companyId,
    metadata: { removed: removeId, by: actor.userId },
  });
  await getService('events').publish({
    name: 'client.updated',
    companyId,
    payload: { clientId: keepId, merged: removeId },
  });
}
