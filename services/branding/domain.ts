// path: services/branding/domain.ts
// Which company a custom domain serves. A host counts only when it is a verified, routed, not removed domain of a company
// whose plan includes custom domains; every other host (including the platform's own) belongs to no company.
import 'server-only';
import { headers } from 'next/headers';
import { normalizeHostname } from '@/lib/domain/hostnames';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { planHas } from '@/services/company/plan';
import { platformHost } from '@/services/domain/domains';

export async function tenantForHost(host: string): Promise<string | null> {
  const name = normalizeHostname(host.split(':')[0] ?? '');
  if (name === '' || name === platformHost().toLowerCase()) return null;
  const { data } = await getAdminSupabase()
    .from('custom_domains')
    .select('company_id')
    .eq('hostname', name)
    .eq('status', 'verified')
    .eq('routing_ok', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) return null;
  const companyId = String(data.company_id);
  return (await planHas(companyId, 'domain.custom')) ? companyId : null;
}

/** The company of the host of the current request, or null on the platform's own host. */
export async function tenantForRequest(): Promise<string | null> {
  const source = await headers();
  const host = source.get('x-forwarded-host') ?? source.get('host');
  return host ? tenantForHost(host) : null;
}
