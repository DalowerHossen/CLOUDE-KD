// path: services/entitlement/entitlement.ts
// The database-backed `entitlement` service. A company's plan key points to a plan; the plan's saved values lie on top
// of the built-in values in config/plans.ts, so the platform team's change is answered at once (within seconds across
// processes) and a plan that is not in the database still answers from the built-in catalogue.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { hasValue, keyKind, type EntitlementMap } from '@/lib/payment/plan-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { EntitlementService } from '@/types/contracts';
import { baseEntitlements } from '@/lib/payment/plan-rules';
import { getPlanBySlug } from '@/services/plan/plans';
import { applyOverrides } from '@/lib/platform/tenant-overrides';
import { cached } from './cache';
import { activeOverrides } from './overrides';

export async function planSlugOf(companyId: string): Promise<string> {
  return cached('company-plan', companyId, async () => {
    const { data, error } = await getAdminSupabase()
      .from('companies')
      .select('plan_key')
      .eq('id', companyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalError(error);
    return String(data?.plan_key ?? 'free');
  });
}

export async function entitlementsOf(
  companyId: string,
): Promise<{ slug: string; values: EntitlementMap }> {
  const slug = await planSlugOf(companyId);
  const plan = await getPlanBySlug(slug);
  const values = plan ? plan.entitlements : baseEntitlements(slug);
  // A custom limit of the platform team lies over the plan, for this company only.
  return { slug, values: applyOverrides(values, await activeOverrides(companyId)) };
}

export function createEntitlementService(): EntitlementService {
  return {
    async has(companyId, key) {
      const { values } = await entitlementsOf(companyId);
      const value = values[key];
      return keyKind(key) === 'switch' ? value === true : hasValue(value);
    },
    async limit(companyId, key) {
      const { values } = await entitlementsOf(companyId);
      const value = values[key];
      return typeof value === 'number' ? value : null;
    },
  };
}
