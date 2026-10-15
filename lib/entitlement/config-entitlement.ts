// path: lib/entitlement/config-entitlement.ts
// Base entitlement service that reads config/plans.ts. STEP 14 replaces it with a database-backed
// service by registering with { override: true }.
import { ENTITLEMENT_KEYS, PLANS, isPlanKey, type EntitlementKey } from '@/config/plans';
import type { EntitlementService } from '@/types/contracts';

function isKey(value: string): value is EntitlementKey {
  return (ENTITLEMENT_KEYS as readonly string[]).includes(value);
}

/** `resolvePlanKey` returns the plan key of a company, or null when the company is unknown. */
export function createConfigEntitlementService(
  resolvePlanKey: (companyId: string) => Promise<string | null>,
): EntitlementService {
  const valueOf = async (companyId: string, key: string): Promise<boolean | number | null | undefined> => {
    if (!isKey(key)) return undefined;
    const planKey = await resolvePlanKey(companyId);
    if (planKey === null || !isPlanKey(planKey)) return undefined;
    return PLANS[planKey].entitlements[key];
  };
  return {
    async has(companyId, key) {
      const value = await valueOf(companyId, key);
      if (value === undefined) return false;
      if (typeof value === 'boolean') return value;
      return value === null || value > 0;
    },
    async limit(companyId, key) {
      const value = await valueOf(companyId, key);
      return typeof value === 'number' ? value : null;
    },
  };
}
