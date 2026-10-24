// path: services/company/companies.ts
// People who belong to more than one company (enterprise plans): list the companies, switch the active one, and add a
// further company owned by the same person. The active company is stored in the person's profile and in the signed
// account claim, which only the server writes; every switch is audited for both companies.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { randomHex } from '@/lib/utils/hash';
import { slugify } from '@/lib/utils/slug';
import type { Actor } from '@/types/contracts';

export const MAX_COMPANIES = 10;

export interface MyCompany {
  id: string;
  name: string;
  role: 'owner' | 'staff';
  active: boolean;
  status: string;
}

export async function myCompanies(actor: Actor): Promise<MyCompany[]> {
  if (actor.role !== 'owner' && actor.role !== 'staff') throw new ForbiddenError();
  const { data, error } = await getAdminSupabase()
    .from('memberships')
    .select('company_id, role, status, companies!inner(id, name, status, deleted_at)')
    .eq('user_id', actor.userId)
    .eq('status', 'active')
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  const out: MyCompany[] = [];
  for (const m of data ?? []) {
    const c = Array.isArray(m.companies) ? m.companies[0] : m.companies;
    if (!c || c.deleted_at) continue;
    out.push({
      id: String(m.company_id),
      name: String(c.name),
      role: String(m.role) as 'owner' | 'staff',
      active: String(m.company_id) === actor.companyId,
      status: String(c.status),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function makeActive(userId: string, companyId: string, role: string): Promise<void> {
  const admin = getAdminSupabase();
  const p = await admin.from('profiles').update({ company_id: companyId }).eq('user_id', userId);
  if (p.error) throw new InternalError(p.error);
  const m = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { company_id: companyId, role },
  });
  if (m.error) throw new InternalError(m.error);
}

export async function switchCompany(actor: Actor, companyId: string): Promise<void> {
  const mine = await myCompanies(actor);
  const target = mine.find((c) => c.id === companyId);
  if (!target) throw new NotFoundError();
  if (target.active) return;
  if (target.status !== 'active') throw new ValidationError('This company is not active.');
  await makeActive(actor.userId, target.id, target.role);
  const record = (id: string | null, action: string): Promise<void> =>
    getService('audit').record({
      action,
      resourceType: 'company',
      resourceId: companyId,
      companyId: id,
      metadata: { from: actor.companyId, to: companyId, by: actor.userId },
    });
  await record(actor.companyId, 'company.switched_away');
  await record(companyId, 'company.switched_to');
}

/** A further company for an owner whose plan allows several. The new company starts on the free plan. */
export async function createAdditionalCompany(actor: Actor, name: string): Promise<{ id: string }> {
  if (actor.role !== 'owner' || !actor.companyId) throw new ForbiddenError();
  const allowed = await getService('entitlement').has(actor.companyId, 'sso.ready');
  if (!allowed) throw new ForbiddenError('Your plan does not include several companies.');
  const mine = await myCompanies(actor);
  if (mine.length >= MAX_COMPANIES)
    throw new ValidationError(`You can have up to ${MAX_COMPANIES} companies.`);
  const admin = getAdminSupabase();
  const slug = `${slugify(name, 50) || 'company'}-${randomHex(3)}`;
  const company = await admin.from('companies').insert({ name, slug }).select('id').single();
  if (company.error) throw new InternalError(company.error);
  const id = String(company.data.id);
  try {
    const m = await admin
      .from('memberships')
      .insert({ company_id: id, user_id: actor.userId, role: 'owner' });
    if (m.error) throw new InternalError(m.error);
  } catch (error) {
    await admin.from('companies').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    throw error;
  }
  await getService('audit').record({
    action: 'company.created_additional',
    resourceType: 'company',
    resourceId: id,
    companyId: id,
    metadata: { from: actor.companyId, by: actor.userId },
  });
  await switchCompany(actor, id);
  return { id };
}
