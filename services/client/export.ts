// path: services/client/export.ts
// Everything the company keeps about one client, as one machine readable file (data subject access and portability).
// Other STEPs add their sections through registered export providers.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { clientExportProviders } from '@/lib/crm/hooks';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { getClient } from './clients';

export async function exportClient(
  actor: Actor,
  clientId: string,
): Promise<Record<string, unknown>> {
  const companyId = actor.companyId as string;
  const client = await getClient(companyId, clientId);
  const admin = getAdminSupabase();
  const [activity, merges, privacy] = await Promise.all([
    admin
      .from('client_activity')
      .select('kind, title, body, created_at')
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('created_at'),
    admin
      .from('client_merges')
      .select('removed_client_id, created_at')
      .eq('company_id', companyId)
      .eq('kept_client_id', clientId),
    admin
      .from('client_privacy_requests')
      .select('kind, status, created_at, decided_at')
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .is('deleted_at', null),
  ]);
  for (const r of [activity, merges, privacy]) if (r.error) throw new InternalError(r.error);
  const sections: Record<string, unknown[]> = {};
  for (const provider of clientExportProviders()) {
    const part = await provider(companyId, clientId).catch(() => null);
    if (part) sections[part.section] = part.rows;
  }
  await getService('audit').record({
    action: 'client.exported',
    resourceType: 'client',
    resourceId: clientId,
    companyId,
    metadata: { by: actor.userId },
  });
  return {
    format: 'kd-client-export',
    version: 1,
    createdAt: new Date().toISOString(),
    client,
    activity: activity.data ?? [],
    merges: merges.data ?? [],
    privacyRequests: privacy.data ?? [],
    sections,
  };
}
