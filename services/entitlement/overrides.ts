// path: services/entitlement/overrides.ts
// Reads the custom limits of a company for the entitlement answers. A failed read leaves the plan's own values in force
// and is logged; it is kept for a few seconds like the other plan answers.
import 'server-only';
import { createLogger } from '@/lib/logger';
import type { OverrideRow } from '@/lib/platform/tenant-overrides';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { EntitlementValue } from '@/config/plans';
import { cached } from './cache';

const log = createLogger({ component: 'tenant-overrides' });

export async function activeOverrides(companyId: string): Promise<OverrideRow[]> {
  try {
    return await cached('tenant-overrides', companyId, async () => {
      const { data, error } = await getAdminSupabase()
        .from('tenant_limit_overrides')
        .select('entitlement_key, value, expires_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        key: String(r.entitlement_key),
        value: r.value as EntitlementValue,
        expiresAt: r.expires_at ? String(r.expires_at) : null,
      }));
    });
  } catch (error) {
    log.error('custom limits could not be read; the plan values stay in force', { error });
    return [];
  }
}
