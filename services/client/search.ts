// path: services/client/search.ts
// The client list: typo-tolerant search, filters, sorting and cursor pages. The database function does the work and
// always filters by company; this file turns its answer into list rows.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { PAGE_LIMIT, decodeCursor, encodeCursor, type ClientListQuery } from '@/lib/crm/search';
import { getAdminSupabase } from '@/lib/supabase/admin';

export interface ClientListItem {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  country: string | null;
  tags: string[];
  status: 'active' | 'archived';
  riskFlag: 'none' | 'watch' | 'high';
  outstanding: string;
  overdue: string;
  lastInvoiceAt: string | null;
  createdAt: string;
}

export async function searchClients(
  companyId: string,
  query: ClientListQuery,
): Promise<{ rows: ClientListItem[]; next: string | null }> {
  const admin = getAdminSupabase();
  const cursor = decodeCursor(query.after);
  const found = await admin.rpc('kd_client_search', {
    p_company: companyId,
    p_q: query.q ?? null,
    p_status: query.status ?? null,
    p_tag: query.tag ?? null,
    p_country: query.country ?? null,
    p_risk: query.risk ?? null,
    p_with_balance: query.withBalance === '1',
    p_sort: query.sort,
    p_desc: query.desc === '1',
    p_after_value: cursor?.v ?? null,
    p_after_id: cursor?.id ?? null,
    p_limit: PAGE_LIMIT + 1,
  });
  if (found.error) throw new InternalError(found.error);
  const hits = (found.data ?? []) as { id: string; sort_value: string }[];
  const page = hits.slice(0, PAGE_LIMIT);
  if (page.length === 0) return { rows: [], next: null };
  const { data, error } = await admin
    .from('clients')
    .select(
      'id, name, email, phone, billing_country, tags, status, risk_flag, outstanding_balance, overdue_balance, last_invoice_at, created_at',
    )
    .eq('company_id', companyId)
    .in(
      'id',
      page.map((h) => h.id),
    );
  if (error) throw new InternalError(error);
  const byId = new Map((data ?? []).map((r) => [String(r.id), r]));
  const rows: ClientListItem[] = [];
  for (const h of page) {
    const r = byId.get(h.id);
    if (!r) continue;
    rows.push({
      id: String(r.id),
      name: String(r.name),
      email: r.email ? String(r.email) : null,
      phone: String(r.phone),
      country: r.billing_country ? String(r.billing_country) : null,
      tags: (r.tags as string[] | null) ?? [],
      status: String(r.status) as ClientListItem['status'],
      riskFlag: String(r.risk_flag) as ClientListItem['riskFlag'],
      outstanding: String(r.outstanding_balance),
      overdue: String(r.overdue_balance),
      lastInvoiceAt: r.last_invoice_at ? String(r.last_invoice_at) : null,
      createdAt: String(r.created_at),
    });
  }
  const last = page[page.length - 1];
  return {
    rows,
    next:
      hits.length > PAGE_LIMIT && last ? encodeCursor({ v: last.sort_value, id: last.id }) : null,
  };
}

/** Tags used by the company's clients, for the filter list. */
export async function clientTags(companyId: string): Promise<string[]> {
  const { data, error } = await getAdminSupabase()
    .from('clients')
    .select('tags')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .limit(1000);
  if (error) throw new InternalError(error);
  const set = new Set<string>();
  for (const r of data ?? []) for (const tag of (r.tags as string[] | null) ?? []) set.add(tag);
  return [...set].sort();
}
