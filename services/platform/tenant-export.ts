// path: services/platform/tenant-export.ts
// The support bundle of one company: what a support engineer needs to look into a problem, as one JSON file. It holds the
// company and plan facts, the people, record counts, the support tickets, the quota bars and the latest activity. It never
// holds bank details, payment credentials, API secrets, tokens, card data or uploaded documents.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { meters } from '@/services/entitlement/usage';
import { listOverrides } from '@/services/platform/tenant-overrides';
import type { Actor } from '@/types/contracts';

const COUNTED = [
  'clients',
  'invoices',
  'payments',
  'expenses',
  'payouts',
  'support_tickets',
] as const;

export interface SupportBundle {
  format: 'kd-support-bundle-v1';
  generatedAt: string;
  watermark: string;
  company: Record<string, unknown>;
  subscription: Record<string, unknown> | null;
  people: { name: string; email: string; role: string; status: string }[];
  counts: Record<string, number | null>;
  tickets: {
    number: string;
    subject: string;
    status: string;
    priority: string;
    createdAt: string;
  }[];
  quotas: { key: string; used: number; limit: number | null }[];
  customLimits: { key: string; value: unknown; reason: string }[];
  recentActivity: { at: string; action: string; resourceType: string }[];
}

async function count(table: string, companyId: string): Promise<number | null> {
  const { count: n, error } = await getAdminSupabase()
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null);
  return error ? null : (n ?? 0);
}

export async function buildSupportBundle(
  actor: Actor,
  companyId: string,
  reason: string,
): Promise<SupportBundle> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const admin = getAdminSupabase();
  const company = await admin
    .from('companies')
    .select('id, name, slug, plan_key, status, country_code, storage_provider, created_at')
    .eq('id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (company.error) throw new InternalError(company.error);
  if (!company.data) throw new NotFoundError();
  const [sub, members, profiles, tickets, activity, meterList, overrides, counted] =
    await Promise.all([
      admin
        .from('platform_subscriptions')
        .select(
          'plan_slug, interval, status, seats, current_period_start, current_period_end, cancel_at_period_end, created_at',
        )
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('memberships')
        .select('user_id, role, status')
        .eq('company_id', companyId)
        .is('deleted_at', null),
      admin
        .from('profiles')
        .select('user_id, email, full_name')
        .eq('company_id', companyId)
        .is('deleted_at', null),
      admin
        .from('support_tickets')
        .select('number, subject, status, priority, created_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('audit_logs')
        .select('created_at, action, resource_type')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(200),
      meters(companyId).catch(() => []),
      listOverrides(companyId).catch(() => []),
      Promise.all(COUNTED.map((t) => count(t, companyId))),
    ]);
  for (const r of [sub, members, profiles, tickets, activity])
    if (r.error) throw new InternalError(r.error);
  const person = new Map((profiles.data ?? []).map((p) => [String(p.user_id), p]));
  const generatedAt = new Date().toISOString();
  const bundle: SupportBundle = {
    format: 'kd-support-bundle-v1',
    generatedAt,
    watermark: `Support bundle ${companyId} ${generatedAt} by ${actor.userId}`,
    company: {
      id: String(company.data.id),
      name: String(company.data.name),
      slug: String(company.data.slug),
      plan: String(company.data.plan_key),
      status: String(company.data.status),
      country: company.data.country_code ? String(company.data.country_code) : null,
      storageProvider: String(company.data.storage_provider),
      createdAt: String(company.data.created_at),
    },
    subscription: sub.data ? { ...sub.data } : null,
    people: (members.data ?? []).map((m) => ({
      name: String(person.get(String(m.user_id))?.full_name ?? ''),
      email: String(person.get(String(m.user_id))?.email ?? ''),
      role: String(m.role),
      status: String(m.status),
    })),
    counts: Object.fromEntries(COUNTED.map((t, i) => [t, counted[i] ?? null])),
    tickets: (tickets.data ?? []).map((r) => ({
      number: String(r.number),
      subject: String(r.subject),
      status: String(r.status),
      priority: String(r.priority),
      createdAt: String(r.created_at),
    })),
    quotas: meterList.map((m) => ({ key: m.key, used: m.used, limit: m.limit })),
    customLimits: overrides.map((o) => ({ key: o.key, value: o.value, reason: o.reason })),
    recentActivity: (activity.data ?? []).map((a) => ({
      at: String(a.created_at),
      action: String(a.action),
      resourceType: String(a.resource_type),
    })),
  };
  await getService('audit').record({
    action: 'platform.support_export',
    resourceType: 'company',
    resourceId: companyId,
    companyId,
    metadata: {
      reason,
      by: actor.userId,
      people: bundle.people.length,
      tickets: bundle.tickets.length,
    },
  });
  return bundle;
}
