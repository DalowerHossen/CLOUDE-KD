// path: services/base/tenant-service.ts
// Implements the tenant contract. The context is cached for one request only (keyed by the caller-supplied loader).
import 'server-only';
import { assertResourceInTenant, resolveTenantContext } from '@/lib/middleware/tenant';
import { createServerSupabase } from '@/lib/supabase/server';
import type { TenantContext, TenantService } from '@/types/contracts';

export function createTenantService(): TenantService {
  const load = async (): Promise<TenantContext> =>
    resolveTenantContext(await createServerSupabase());
  return {
    getTenantContext: load,
    assertSameTenant: async (resourceCompanyId) => {
      assertResourceInTenant(await load(), resourceCompanyId);
    },
  };
}
