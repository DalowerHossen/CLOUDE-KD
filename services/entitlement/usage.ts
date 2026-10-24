// path: services/entitlement/usage.ts
// Usage meters, limit checks and the locked-feature prompt. Counts are read from the source tables (invoices this month,
// clients, seats, storage), so they are always true; `usage_counters` keeps a monthly record for billing the part above
// the limit. A company over a limit (after a downgrade) keeps all its data: only new work is refused.
import 'server-only';
import { z } from 'zod';
import { AppError, InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { meter, METERED_KEYS, upgradeTarget, type Meter } from '@/lib/payment/plan-rules';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { listPlans } from '@/services/plan/plans';
import { entitlementsOf } from './entitlement';

const log = createLogger({ component: 'usage' });

export const currentPeriod = (at: Date = new Date()): string => at.toISOString().slice(0, 7);

async function countRows(table: string, companyId: string): Promise<number> {
  const { count: n, error } = await getAdminSupabase()
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  return n ?? 0;
}

/** The use of a limited feature right now. */
export async function usedNow(
  companyId: string,
  key: string,
  at: Date = new Date(),
): Promise<number> {
  const admin = getAdminSupabase();
  switch (key) {
    case 'invoices.monthly': {
      const start = `${currentPeriod(at)}-01T00:00:00.000Z`;
      const { count: n, error } = await admin
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('kind', 'invoice')
        .gte('created_at', start)
        .is('deleted_at', null);
      if (error) throw new InternalError(error);
      return n ?? 0;
    }
    case 'clients.max':
      return countRows('clients', companyId);
    case 'staff.seats': {
      const { count: n, error } = await admin
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'active')
        .is('deleted_at', null);
      if (error) throw new InternalError(error);
      return n ?? 0;
    }
    case 'storage.gigabytes': {
      const { data, error } = await admin.rpc('kd_company_storage_bytes', { p_company: companyId });
      if (error) throw new InternalError(error);
      const bytes = z.coerce.number().parse(data ?? 0);
      return toInt(bytes / 1_073_741_824 + 0.999999, 0);
    }
    default:
      return 0;
  }
}

export interface MeterView extends Meter {
  key: string;
}

/** The quota bars of a company: used, limit, percent and state (ok, warning from 80 percent, blocked at 100 percent). */
export async function meters(companyId: string): Promise<MeterView[]> {
  const { values } = await entitlementsOf(companyId);
  const out: MeterView[] = [];
  for (const key of METERED_KEYS) {
    const raw = values[key];
    const limit = typeof raw === 'number' ? raw : null;
    out.push({ key, ...meter(await usedNow(companyId, key), limit) });
  }
  return out;
}

export interface LimitAnswer {
  allowed: boolean;
  meter: Meter;
  message: string | null;
}

/** Can the company add `delta` more of this feature? Reads the true count; nothing is changed. */
export async function checkLimit(companyId: string, key: string, delta = 1): Promise<LimitAnswer> {
  const { values } = await entitlementsOf(companyId);
  const raw = values[key];
  const limit = typeof raw === 'number' ? raw : null;
  const used = await usedNow(companyId, key);
  const m = meter(used, limit);
  const allowed = limit === null || used + delta <= limit;
  return {
    allowed,
    meter: m,
    message: allowed ? null : `Your plan allows ${limit} for this. Upgrade your plan to add more.`,
  };
}

/** Refuses with a clear message when the limit would be passed. Existing data is never touched. */
export async function assertWithinLimit(companyId: string, key: string, delta = 1): Promise<void> {
  const answer = await checkLimit(companyId, key, delta);
  if (!answer.allowed)
    throw new AppError('conflict', 409, answer.message ?? 'Your plan limit is reached.');
}

export interface Paywall {
  locked: boolean;
  currentPlan: string;
  upgradeTo: { slug: string; name: string } | null;
  message: string | null;
}

/** Data for the soft paywall: is the feature locked, and which plan opens it. */
export async function paywall(companyId: string, key: string): Promise<Paywall> {
  const { slug, values } = await entitlementsOf(companyId);
  const value = values[key];
  const locked = value === false || value === 0 || value === undefined;
  if (!locked) return { locked: false, currentPlan: slug, upgradeTo: null, message: null };
  const plans = await listPlans();
  const target = upgradeTarget(plans, slug, key);
  return {
    locked: true,
    currentPlan: slug,
    upgradeTo: target ? { slug: target.slug, name: target.name } : null,
    message: target
      ? `This is part of the ${target.name} plan.`
      : 'This feature is not part of your plan.',
  };
}

/** Writes the true use of this month into `usage_counters` (for billing the part above the limit). Run daily. */
export async function snapshotUsage(period: string = currentPeriod()): Promise<number> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('companies')
    .select('id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(5000);
  if (error) throw new InternalError(error);
  let written = 0;
  for (const c of data ?? []) {
    const companyId = String(c.id);
    try {
      const { values } = await entitlementsOf(companyId);
      const raw = values['invoices.monthly'];
      const limit = typeof raw === 'number' ? raw : null;
      const used = await usedNow(companyId, 'invoices.monthly', new Date(`${period}-15T00:00:00Z`));
      const overage = limit === null ? 0 : used > limit ? used - limit : 0;
      const existing = await admin
        .from('usage_counters')
        .select('id, billed_at')
        .eq('company_id', companyId)
        .eq('entitlement_key', 'invoices.monthly')
        .eq('period', period)
        .is('deleted_at', null)
        .maybeSingle();
      if (existing.error) throw new InternalError(existing.error);
      if (existing.data?.billed_at) continue; // already billed: the record stays as it was billed
      const row = { used, limit_value: limit, overage_units: overage };
      const res = existing.data
        ? await admin.from('usage_counters').update(row).eq('id', existing.data.id)
        : await admin
            .from('usage_counters')
            .insert({ company_id: companyId, entitlement_key: 'invoices.monthly', period, ...row });
      if (res.error) throw new InternalError(res.error);
      written += 1;
    } catch (thrown) {
      log.error('usage not recorded', { companyId, error: String(thrown) });
    }
  }
  return written;
}
