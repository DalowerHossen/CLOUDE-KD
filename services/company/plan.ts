// path: services/company/plan.ts
// Plan checks for tenant screens. The entitlement contract is used when it is registered; before that the plan
// catalogue (config/plans.ts) answers for the plan key stored on the company.
import 'server-only';
import { PLANS, isPlanKey, type EntitlementKey, type PlanKey } from '@/config/plans';
import { tryGetService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function planKeyOf(companyId: string): Promise<PlanKey> {
  const { data, error } = await getAdminSupabase()
    .from('companies')
    .select('plan_key')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw new InternalError(error);
  const key = String(data?.plan_key ?? 'free');
  return isPlanKey(key) ? key : 'free';
}

export async function planHas(companyId: string, key: EntitlementKey): Promise<boolean> {
  const service = tryGetService('entitlement');
  if (service) return service.has(companyId, key);
  const value = PLANS[await planKeyOf(companyId)].entitlements[key];
  return value === true || (typeof value === 'number' && value > 0) || value === null;
}
