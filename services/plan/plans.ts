// path: services/plan/plans.ts
// Plans the platform team can edit: prices (USD, monthly and yearly, per seat), trial days, limits and features, order,
// badge, visibility, archive, and a change log. The four built-in plans (config/plans.ts) are put into the database on
// first use; until the platform team sets prices they are 0 and the paid plans stay hidden. An archived plan is hidden
// from sign-up but its companies keep it.
import 'server-only';
import { PLANS, PLAN_KEYS } from '@/config/plans';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import {
  entitlementsInput,
  mergeEntitlements,
  planInput,
  planUpdateInput,
  type EntitlementMap,
} from '@/lib/payment/plan-rules';
import { Money } from '@/lib/utils/currency';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { cached, invalidatePlanCache } from '@/services/entitlement/cache';

export interface PlanView {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  seatPriceMonthly: string;
  trialDays: number;
  visible: boolean;
  sortOrder: number;
  badge: string | null;
  status: 'active' | 'archived';
  version: number;
  entitlements: EntitlementMap;
  overage: Record<string, string>;
}

const PLAN_COLUMNS =
  'id, slug, name, description, price_monthly, price_yearly, seat_price_monthly, trial_days, visible, sort_order, badge, status, version';

interface PlanRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_monthly: string | number;
  price_yearly: string | number;
  seat_price_monthly: string | number;
  trial_days: number;
  visible: boolean;
  sort_order: number;
  badge: string | null;
  status: 'active' | 'archived';
  version: number;
}

const money = (v: string | number): string => Money.parseRounded(String(v)).toDbString();

function requireSuper(actor: Actor): void {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
}

async function note(
  planId: string,
  action: string,
  actorId: string | null,
  changes: Record<string, unknown>,
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('plan_history')
    .insert({ plan_id: planId, action, actor_id: actorId, changes });
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: `plan.${action}`,
    resourceType: 'plan',
    resourceId: planId,
    companyId: null,
    metadata: changes,
  });
}

async function loadAll(): Promise<PlanView[]> {
  const admin = getAdminSupabase();
  const [plans, values] = await Promise.all([
    admin
      .from('plans')
      .select(PLAN_COLUMNS)
      .is('deleted_at', null)
      .order('sort_order')
      .order('slug'),
    admin
      .from('plan_entitlements')
      .select('plan_id, entitlement_key, value, overage_price')
      .is('deleted_at', null)
      .limit(5000),
  ]);
  if (plans.error) throw new InternalError(plans.error);
  if (values.error) throw new InternalError(values.error);
  return ((plans.data ?? []) as PlanRow[]).map((p) => {
    const mine = (values.data ?? []).filter((v) => String(v.plan_id) === p.id);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      priceMonthly: money(p.price_monthly),
      priceYearly: money(p.price_yearly),
      seatPriceMonthly: money(p.seat_price_monthly),
      trialDays: p.trial_days,
      visible: p.visible,
      sortOrder: p.sort_order,
      badge: p.badge,
      status: p.status,
      version: p.version,
      entitlements: mergeEntitlements(
        p.slug,
        mine.map((v) => ({
          key: String(v.entitlement_key),
          value: v.value as boolean | number | null,
        })),
      ),
      overage: Object.fromEntries(
        mine
          .filter((v) => v.overage_price !== null)
          .map((v) => [String(v.entitlement_key), money(v.overage_price as string | number)]),
      ),
    };
  });
}

const SEED_RETRY_MS = 5 * 60_000;
let lastSeedFailureAt = 0;
let seededInThisProcess = false;

/**
 * Puts the built-in plans and their features into the database and fills in what is missing (a failed earlier run
 * can leave a plan without features). Safe when two requests do it at once: a duplicate is skipped.
 */
export async function ensurePlansSeeded(): Promise<void> {
  if (seededInThisProcess) return;
  // A failed top-up (for example a migration that is not applied yet) must not take every page down: the plans are read
  // from the database on top of the built-in values, so a missing row only means the built-in value is used. The next
  // try waits five minutes.
  if (Date.now() - lastSeedFailureAt < SEED_RETRY_MS) return;
  try {
    await seedPlans();
  } catch (error) {
    lastSeedFailureAt = Date.now();
    createLogger({ service: 'plans' }).error(
      'the built-in plans could not be put into the database',
      { error },
    );
  }
}

async function seedPlans(): Promise<void> {
  const admin = getAdminSupabase();
  for (const [index, key] of PLAN_KEYS.entries()) {
    const def = PLANS[key];
    let planId: string;
    const found = await admin
      .from('plans')
      .select('id')
      .eq('slug', key)
      .is('deleted_at', null)
      .maybeSingle();
    if (found.error) throw new InternalError(found.error);
    if (found.data) {
      planId = String(found.data.id);
    } else {
      const made = await admin
        .from('plans')
        .insert({
          slug: key,
          name: def.label,
          sort_order: (index + 1) * 10,
          visible: key === 'free',
        })
        .select('id')
        .single();
      if (made.error) {
        if (made.error.code === '23505') continue;
        throw new InternalError(made.error);
      }
      planId = String(made.data.id);
    }
    const have = await admin
      .from('plan_entitlements')
      .select('entitlement_key')
      .eq('plan_id', planId)
      .is('deleted_at', null);
    if (have.error) throw new InternalError(have.error);
    const present = new Set((have.data ?? []).map((r) => String(r.entitlement_key)));
    // A value of null means "no limit" and is stored as an empty value (migration S16_023).
    const rows = Object.entries(def.entitlements)
      .filter(([k]) => !present.has(k))
      .map(([k, v]) => ({ plan_id: planId, entitlement_key: k, value: v }));
    if (rows.length === 0) continue;
    const ins = await admin.from('plan_entitlements').insert(rows);
    if (ins.error && ins.error.code !== '23505') throw new InternalError(ins.error);
  }
  seededInThisProcess = true;
  invalidatePlanCache();
}

export async function listPlans(options: { includeArchived?: boolean } = {}): Promise<PlanView[]> {
  await ensurePlansSeeded();
  const all = await cached('plans', 'all', loadAll);
  return options.includeArchived ? all : all.filter((p) => p.status === 'active');
}

export async function getPlanBySlug(slug: string): Promise<PlanView | null> {
  return (await listPlans({ includeArchived: true })).find((p) => p.slug === slug) ?? null;
}

export async function getPlanById(id: string): Promise<PlanView> {
  const plan = (await listPlans({ includeArchived: true })).find((p) => p.id === id);
  if (!plan) throw new NotFoundError();
  return plan;
}

/** What the pricing page and sign-up show: visible, active plans in order. */
export async function publicPlans(): Promise<PlanView[]> {
  return (await listPlans()).filter((p) => p.visible);
}

export async function createPlan(actor: Actor, input: unknown): Promise<PlanView> {
  requireSuper(actor);
  const parsed = planInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The plan is not valid.');
  const d = parsed.data;
  await ensurePlansSeeded();
  const { data, error } = await getAdminSupabase()
    .from('plans')
    .insert({
      slug: d.slug,
      name: d.name,
      description: d.description,
      price_monthly: d.priceMonthly,
      price_yearly: d.priceYearly,
      seat_price_monthly: d.seatPriceMonthly,
      trial_days: d.trialDays,
      visible: d.visible,
      sort_order: d.sortOrder,
      badge: d.badge,
      updated_by: actor.userId,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('A plan with this slug already exists.');
    throw new InternalError(error);
  }
  await note(String(data.id), 'created', actor.userId, { slug: d.slug });
  invalidatePlanCache();
  return getPlanById(String(data.id));
}

/** Changes the details of a plan. `version` is the version the editor saw (a newer one means someone else saved first). */
export async function updatePlan(
  actor: Actor,
  id: string,
  version: number,
  input: unknown,
): Promise<PlanView> {
  requireSuper(actor);
  const parsed = planUpdateInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The plan is not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = { updated_by: actor.userId };
  if (d.name !== undefined) patch.name = d.name;
  if (d.description !== undefined) patch.description = d.description;
  if (d.priceMonthly !== undefined) patch.price_monthly = d.priceMonthly;
  if (d.priceYearly !== undefined) patch.price_yearly = d.priceYearly;
  if (d.seatPriceMonthly !== undefined) patch.seat_price_monthly = d.seatPriceMonthly;
  if (d.trialDays !== undefined) patch.trial_days = d.trialDays;
  if (d.visible !== undefined) patch.visible = d.visible;
  if (d.sortOrder !== undefined) patch.sort_order = d.sortOrder;
  if (d.badge !== undefined) patch.badge = d.badge;
  const { data, error } = await getAdminSupabase()
    .from('plans')
    .update(patch)
    .eq('id', id)
    .eq('version', version)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new ConflictError('The plan was changed by someone else. Reload and try again.');
  await note(id, 'updated', actor.userId, { fields: Object.keys(d) });
  invalidatePlanCache();
  return getPlanById(id);
}

/** Saves the features and limits of a plan. A number is a limit, null is no limit, true or false is a switch. */
export async function setEntitlements(actor: Actor, id: string, input: unknown): Promise<PlanView> {
  requireSuper(actor);
  const parsed = entitlementsInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The features are not valid.');
  await getPlanById(id);
  const admin = getAdminSupabase();
  const keys = Object.keys(parsed.data.values);
  const current = await admin
    .from('plan_entitlements')
    .select('id, entitlement_key')
    .eq('plan_id', id)
    .is('deleted_at', null);
  if (current.error) throw new InternalError(current.error);
  for (const key of keys) {
    const value = parsed.data.values[key];
    const overage = parsed.data.overage[key];
    const existing = (current.data ?? []).find((r) => r.entitlement_key === key);
    const row = { value, ...(overage !== undefined ? { overage_price: overage } : {}) };
    const written = existing
      ? await admin.from('plan_entitlements').update(row).eq('id', existing.id)
      : await admin.from('plan_entitlements').insert({ plan_id: id, entitlement_key: key, ...row });
    if (written.error) throw new InternalError(written.error);
  }
  await note(id, 'entitlements_saved', actor.userId, { keys });
  invalidatePlanCache();
  return getPlanById(id);
}

/** Hides a plan from sign-up. Companies on it keep it. The free plan cannot be archived (it is where new companies start). */
export async function archivePlan(actor: Actor, id: string): Promise<PlanView> {
  requireSuper(actor);
  const plan = await getPlanById(id);
  if (plan.slug === 'free') throw new ValidationError('The free plan cannot be archived.');
  const { error } = await getAdminSupabase()
    .from('plans')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      visible: false,
      updated_by: actor.userId,
    })
    .eq('id', id)
    .eq('status', 'active');
  if (error) throw new InternalError(error);
  await note(id, 'archived', actor.userId, { slug: plan.slug });
  invalidatePlanCache();
  return getPlanById(id);
}

export async function restorePlan(actor: Actor, id: string): Promise<PlanView> {
  requireSuper(actor);
  const plan = await getPlanById(id);
  const { error } = await getAdminSupabase()
    .from('plans')
    .update({ status: 'active', archived_at: null, updated_by: actor.userId })
    .eq('id', id)
    .eq('status', 'archived');
  if (error) throw new InternalError(error);
  await note(id, 'restored', actor.userId, { slug: plan.slug });
  invalidatePlanCache();
  return getPlanById(id);
}

export async function planHistory(
  id: string,
): Promise<{ action: string; changes: Record<string, unknown>; at: string }[]> {
  const { data, error } = await getAdminSupabase()
    .from('plan_history')
    .select('action, changes, created_at')
    .eq('plan_id', id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    action: String(r.action),
    changes: r.changes as Record<string, unknown>,
    at: String(r.created_at),
  }));
}
