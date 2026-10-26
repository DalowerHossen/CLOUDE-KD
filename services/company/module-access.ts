// path: services/company/module-access.ts
// Which optional modules (config/features.ts) a company may use. Everything is off until the super admin turns it on.
import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { MODULES, moduleForApi, moduleForPage } from '@/config/features';
import { InternalError, NotFoundError } from '@/lib/errors';
import { enabledKeys, type FlagRow } from '@/lib/features/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { currentActor } from '@/services/auth/actor';
import { cached } from '@/services/entitlement/cache';
import { engagedKillSwitches } from '@/services/platform/controls';
import { entitlementsOf } from '@/services/entitlement/entitlement';

const KEYS = MODULES.map((m) => m.key);

async function load(companyId: string): Promise<ReadonlySet<string>> {
  const { data, error } = await getAdminSupabase()
    .from('feature_flags')
    .select('key, company_id, enabled, rollout_percent')
    .like('key', 'module.%')
    .or(`company_id.is.null,company_id.eq.${companyId}`)
    .is('deleted_at', null)
    .limit(500);
  if (error) throw new InternalError(error);
  const rows: FlagRow[] = (data ?? []).map((r) => ({
    key: String(r.key),
    companyId: r.company_id ? String(r.company_id) : null,
    enabled: r.enabled === true,
    rolloutPercent: Number(r.rollout_percent),
  }));
  const on = enabledKeys(rows, companyId, KEYS);
  // A module tied to a plan switch needs the plan to carry it, unless it was turned on for this company by name.
  const { values } = await entitlementsOf(companyId);
  for (const mod of MODULES) {
    if (!mod.entitlement || !on.has(mod.key)) continue;
    const granted = rows.some((r) => r.key === mod.key && r.companyId === companyId && r.enabled);
    if (!granted && values[mod.entitlement] !== true) on.delete(mod.key);
  }
  // A kill switch of the super admin turns a module off for every company, whatever its own flag says.
  const killed = await engagedKillSwitches();
  for (const key of killed) on.delete(key);
  return on;
}

/** The module keys that are on for the company. Answers are kept for a few seconds. */
export async function enabledModules(companyId: string): Promise<ReadonlySet<string>> {
  return cached('modules', companyId, () => load(companyId));
}

export async function isModuleEnabled(companyId: string, key: string): Promise<boolean> {
  return (await enabledModules(companyId)).has(key);
}

/** A company API path of a module that is off answers "not found". Core paths pass without a database read. */
export async function assertApiModuleEnabled(
  pathname: string,
  companyId: string | null,
): Promise<void> {
  const mod = moduleForApi(pathname);
  if (!mod) return;
  if (!companyId || !(await isModuleEnabled(companyId, mod.key))) throw new NotFoundError();
}

const pageGate = cache(async (pathname: string): Promise<void> => {
  const mod = moduleForPage(pathname);
  if (!mod) return;
  const actor = await currentActor();
  if (!actor?.companyId) return; // not signed in or a platform user: the page guards decide
  if (!(await isModuleEnabled(actor.companyId, mod.key))) notFound();
});

/** For the template of the dashboard: a page of a module that is off is "not found". The proxy passes the path. */
export async function assertPageModuleEnabled(): Promise<void> {
  const pathname = (await headers()).get('x-pathname');
  if (pathname) await pageGate(pathname);
}
