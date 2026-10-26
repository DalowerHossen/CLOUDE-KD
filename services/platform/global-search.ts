// path: services/platform/global-search.ts
// One search over all companies for the platform team: companies, people, clients, invoice numbers and support tickets.
// The text is cleaned for pattern filters, the number of searches is limited per person and every search is audited (the
// kinds and the length of the text, never the text itself, because it may be a name or an address).
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, RateLimitError } from '@/lib/errors';
import { PER_KIND, patternSafe, type Hit } from '@/lib/platform/global-search';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface SearchResult {
  hits: Hit[];
  failedKinds: string[];
}

export async function globalSearch(actor: Actor, text: string): Promise<SearchResult> {
  if (actor.role !== 'super_admin' && actor.role !== 'ceo') throw new ForbiddenError();
  const t = patternSafe(text);
  if (t.length < 3) return { hits: [], failedKinds: [] };
  const limit = await getService('security').rateLimit(
    `admin-search:${actor.userId}`,
    'api-default',
  );
  if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);
  const admin = getAdminSupabase();
  const jobs: { kind: string; run: () => PromiseLike<Hit[]> }[] = [
    {
      kind: 'company',
      run: async () => {
        const r = await admin
          .from('companies')
          .select('id, name, slug, status, plan_key')
          .is('deleted_at', null)
          .or(`name.ilike.%${t}%,slug.ilike.%${t}%`)
          .limit(PER_KIND);
        if (r.error) throw r.error;
        return (r.data ?? []).map((c) => ({
          kind: 'company' as const,
          id: String(c.id),
          title: String(c.name),
          detail: `${String(c.slug)} - ${String(c.plan_key)} - ${String(c.status)}`,
          href: `/admin/tenants/${String(c.id)}`,
          companyId: String(c.id),
          companyName: String(c.name),
        }));
      },
    },
    {
      kind: 'user',
      run: async () => {
        const r = await admin
          .from('profiles')
          .select('user_id, company_id, email, full_name, status')
          .is('deleted_at', null)
          .or(`email.ilike.%${t}%,full_name.ilike.%${t}%`)
          .limit(PER_KIND);
        if (r.error) throw r.error;
        return (r.data ?? []).map((u) => ({
          kind: 'user' as const,
          id: String(u.user_id),
          title: String(u.full_name) || String(u.email),
          detail: `${String(u.email)} - ${String(u.status)}`,
          href: `/admin/users/${String(u.user_id)}`,
          companyId: u.company_id ? String(u.company_id) : null,
          companyName: '',
        }));
      },
    },
    {
      kind: 'client',
      run: async () => {
        const r = await admin
          .from('clients')
          .select('id, company_id, name, email')
          .is('deleted_at', null)
          .or(`name.ilike.%${t}%,email.ilike.%${t}%`)
          .limit(PER_KIND);
        if (r.error) throw r.error;
        return (r.data ?? []).map((c) => ({
          kind: 'client' as const,
          id: String(c.id),
          title: String(c.name),
          detail: String(c.email ?? ''),
          href: null,
          companyId: String(c.company_id),
          companyName: '',
        }));
      },
    },
    {
      kind: 'invoice',
      run: async () => {
        const r = await admin
          .from('invoices')
          .select('id, company_id, number, status')
          .is('deleted_at', null)
          .ilike('number', `%${t}%`)
          .limit(PER_KIND);
        if (r.error) throw r.error;
        return (r.data ?? []).map((i) => ({
          kind: 'invoice' as const,
          id: String(i.id),
          title: String(i.number),
          detail: String(i.status),
          href: null,
          companyId: String(i.company_id),
          companyName: '',
        }));
      },
    },
    {
      kind: 'ticket',
      run: async () => {
        const r = await admin
          .from('support_tickets')
          .select('id, company_id, number, subject, status')
          .is('deleted_at', null)
          .or(`number.ilike.%${t}%,subject.ilike.%${t}%`)
          .limit(PER_KIND);
        if (r.error) throw r.error;
        return (r.data ?? []).map((k) => ({
          kind: 'ticket' as const,
          id: String(k.id),
          title: `${String(k.number)} ${String(k.subject)}`,
          detail: String(k.status),
          href: null,
          companyId: String(k.company_id),
          companyName: '',
        }));
      },
    },
  ];
  const settled = await Promise.allSettled(jobs.map((j) => j.run()));
  const hits: Hit[] = [];
  const failedKinds: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') hits.push(...s.value);
    else failedKinds.push(jobs[i]?.kind ?? 'unknown');
  });
  if (failedKinds.length === jobs.length) throw new InternalError(new Error('search failed'));
  // Company names for the rows that only know the company id.
  const ids = [
    ...new Set(hits.flatMap((h) => (h.companyId && !h.companyName ? [h.companyId] : []))),
  ];
  if (ids.length > 0) {
    const c = await admin.from('companies').select('id, name').in('id', ids);
    const names = new Map((c.data ?? []).map((row) => [String(row.id), String(row.name)]));
    for (const h of hits)
      if (h.companyId && !h.companyName) h.companyName = names.get(h.companyId) ?? '';
  }
  await getService('audit').record({
    action: 'platform.global_search',
    resourceType: 'search',
    resourceId: null,
    companyId: null,
    metadata: { length: t.length, hits: hits.length, by: actor.userId },
  });
  return { hits, failedKinds };
}
