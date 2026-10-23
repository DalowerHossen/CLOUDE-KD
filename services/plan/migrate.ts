// path: services/plan/migrate.ts
// Moving companies between plans: one company (used by subscriptions) or many (the platform team, with a dry run that
// shows what a lower plan would leave over its limits). Nothing is deleted or locked by a move: a company over a limit
// keeps its data and is only stopped from adding more.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { downgradeImpact, METERED_KEYS, type Impact } from '@/lib/payment/plan-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { invalidatePlanCache } from '@/services/entitlement/cache';
import { usedNow } from '@/services/entitlement/usage';
import { getPlanBySlug } from './plans';

const MAX_BULK = 500;

/** What moving this company to the plan would leave over its limits (empty when nothing). */
export async function impactOf(companyId: string, toSlug: string): Promise<Impact[]> {
  const plan = await getPlanBySlug(toSlug);
  if (!plan) throw new NotFoundError();
  const used: Record<string, number> = {};
  for (const key of METERED_KEYS) used[key] = await usedNow(companyId, key);
  return downgradeImpact(used, plan.entitlements);
}

/** Moves one company to a plan. The plan must exist; an archived plan can still be given to a company by the platform team. */
export async function changeCompanyPlan(
  companyId: string,
  toSlug: string,
  actorId: string | null,
  reason: string,
): Promise<{ from: string; to: string }> {
  const plan = await getPlanBySlug(toSlug);
  if (!plan) throw new NotFoundError();
  const admin = getAdminSupabase();
  const current = await admin
    .from('companies')
    .select('plan_key')
    .eq('id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (current.error) throw new InternalError(current.error);
  if (!current.data) throw new NotFoundError();
  const from = String(current.data.plan_key);
  if (from === toSlug) return { from, to: toSlug };
  const { error } = await admin
    .from('companies')
    .update({ plan_key: toSlug })
    .eq('id', companyId)
    .eq('plan_key', from);
  if (error) throw new InternalError(error);
  invalidatePlanCache();
  await getService('audit').record({
    action: 'plan.company_moved',
    resourceType: 'company',
    resourceId: companyId,
    companyId,
    metadata: { from, to: toSlug, reason: reason.slice(0, 200), by: actorId },
  });
  return { from, to: toSlug };
}

export interface BulkResult {
  matched: number;
  moved: number;
  dryRun: boolean;
  overLimit: { companyId: string; impact: Impact[] }[];
}

/** Moves companies from one plan to another. With `dryRun` nothing changes and the result shows who would be over a limit. */
export async function migrateTenants(
  actor: Actor,
  input: { fromSlug: string; toSlug: string; companyIds?: readonly string[]; dryRun: boolean },
): Promise<BulkResult> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  if (input.fromSlug === input.toSlug) throw new ValidationError('Choose two different plans.');
  if (!(await getPlanBySlug(input.toSlug))) throw new NotFoundError();
  let q = getAdminSupabase()
    .from('companies')
    .select('id')
    .eq('plan_key', input.fromSlug)
    .is('deleted_at', null)
    .limit(MAX_BULK + 1);
  if (input.companyIds && input.companyIds.length > 0) q = q.in('id', [...input.companyIds]);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const ids = (data ?? []).map((r) => String(r.id));
  if (ids.length > MAX_BULK)
    throw new ValidationError(`Move at most ${MAX_BULK} companies at a time.`);
  const overLimit: BulkResult['overLimit'] = [];
  for (const id of ids) {
    const impact = await impactOf(id, input.toSlug);
    if (impact.length > 0) overLimit.push({ companyId: id, impact });
  }
  let moved = 0;
  if (!input.dryRun) {
    for (const id of ids) {
      await changeCompanyPlan(id, input.toSlug, actor.userId, 'Bulk move by the platform team');
      moved += 1;
    }
  }
  return { matched: ids.length, moved, dryRun: input.dryRun, overLimit };
}
