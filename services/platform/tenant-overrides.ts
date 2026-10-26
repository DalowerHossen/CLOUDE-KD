// path: services/platform/tenant-overrides.ts
// Custom limits per company for the super admin: list what is set (with the plan's own value beside it), set one, remove one.
// Every change is audited and clears the plan answers at once.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError } from '@/lib/errors';
import type { EntitlementValue } from '@/config/plans';
import type { TenantOverrideInput } from '@/lib/platform/tenant-overrides';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { invalidatePlanCache } from '@/services/entitlement/cache';
import { planSlugOf } from '@/services/entitlement/entitlement';
import { getPlanBySlug } from '@/services/plan/plans';
import { baseEntitlements } from '@/lib/payment/plan-rules';
import type { Actor } from '@/types/contracts';

export interface OverrideView {
  key: string;
  value: EntitlementValue;
  planValue: EntitlementValue | undefined;
  reason: string;
  expiresAt: string | null;
  expired: boolean;
}

export async function listOverrides(companyId: string): Promise<OverrideView[]> {
  const { data, error } = await getAdminSupabase()
    .from('tenant_limit_overrides')
    .select('entitlement_key, value, reason, expires_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('entitlement_key')
    .limit(100);
  if (error) throw new InternalError(error);
  const slug = await planSlugOf(companyId);
  const plan = await getPlanBySlug(slug);
  const planValues = plan ? plan.entitlements : baseEntitlements(slug);
  return (data ?? []).map((r) => ({
    key: String(r.entitlement_key),
    value: r.value as EntitlementValue,
    planValue: planValues[String(r.entitlement_key)],
    reason: String(r.reason),
    expiresAt: r.expires_at ? String(r.expires_at) : null,
    expired: r.expires_at ? Date.parse(String(r.expires_at)) <= Date.now() : false,
  }));
}

export async function runOverride(actor: Actor, input: TenantOverrideInput): Promise<void> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const admin = getAdminSupabase();
  const company = await admin
    .from('companies')
    .select('id')
    .eq('id', input.companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!company.data) throw new NotFoundError();
  const existing = await admin
    .from('tenant_limit_overrides')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('entitlement_key', input.key)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  if (input.action === 'clear') {
    if (!existing.data) throw new NotFoundError();
    const r = await admin
      .from('tenant_limit_overrides')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', String(existing.data.id));
    if (r.error) throw new InternalError(r.error);
  } else {
    const row = {
      value: input.value,
      reason: input.reason,
      set_by: actor.userId,
      expires_at: input.expiresAt,
    };
    const r = existing.data
      ? await admin.from('tenant_limit_overrides').update(row).eq('id', String(existing.data.id))
      : await admin
          .from('tenant_limit_overrides')
          .insert({ ...row, company_id: input.companyId, entitlement_key: input.key });
    if (r.error) throw new InternalError(r.error);
  }
  invalidatePlanCache();
  await getService('audit').record({
    action: `platform.tenant_limit_${input.action}`,
    resourceType: 'company',
    resourceId: input.companyId,
    companyId: input.companyId,
    metadata: {
      key: input.key,
      value: input.action === 'set' ? input.value : null,
      by: actor.userId,
    },
  });
}
