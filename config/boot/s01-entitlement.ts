// path: config/boot/s01-entitlement.ts
// Registers the config-based entitlement service. The plan of the current tenant comes from the tenant contract.
import { createConfigEntitlementService } from '@/lib/entitlement/config-entitlement';
import { registerService, tryGetService } from '@/lib/container';

export async function boot(): Promise<void> {
  registerService(
    'entitlement',
    createConfigEntitlementService(async (companyId) => {
      const tenant = tryGetService('tenant');
      if (!tenant) return null;
      const context = await tenant.getTenantContext();
      return context.companyId === companyId ? context.planKey : null;
    }),
  );
}
