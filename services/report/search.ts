// path: services/report/search.ts
// Search across what STEP 09 owns: invoices, estimates, credit notes and projects. Clients and products are found
// through their own APIs by the page. Each kind is searched only when the person may see it.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface SearchHit {
  kind: 'invoice' | 'estimate' | 'credit_note' | 'project';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const clean = (q: string): string =>
  q
    .replace(/[^\p{L}\p{N} .\-/]/gu, ' ')
    .trim()
    .slice(0, 60);

export async function searchWork(actor: Actor, query: string): Promise<SearchHit[]> {
  if (!actor.companyId) return [];
  const text = clean(query);
  if (text.length < 2) return [];
  const companyId = actor.companyId;
  const admin = getAdminSupabase();
  const perms = getService('permissions');
  const [invoices, estimates, credits, projects] = await Promise.all([
    perms.can(actor, 'invoice.read', { type: 'invoice' }),
    perms.can(actor, 'estimate.read', { type: 'estimate' }),
    perms.can(actor, 'credit.read', { type: 'credit_note' }),
    perms.can(actor, 'project.read', { type: 'project' }),
  ]);
  const hits: SearchHit[] = [];
  const like = `%${text}%`;
  if (invoices) {
    const { data, error } = await admin
      .from('invoices')
      .select('id, number, walk_in_name, bill_to, status, total, kind')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .or(
        `number.ilike.${like},walk_in_name.ilike.${like},bill_to->>name.ilike.${like},po_number.ilike.${like}`,
      )
      .order('created_at', { ascending: false })
      .limit(6);
    if (error) throw new InternalError(error);
    for (const r of data ?? []) {
      const bill = (r.bill_to ?? {}) as { name?: string };
      hits.push({
        kind: 'invoice',
        id: String(r.id),
        title: r.number ? String(r.number) : 'Draft',
        subtitle: `${bill.name || String(r.walk_in_name ?? '')} - ${Money.parseRounded(String(r.total)).toDbString()} - ${String(r.status)}`,
        href: `/invoices/${String(r.id)}`,
      });
    }
  }
  if (estimates) {
    const { data, error } = await admin
      .from('estimates')
      .select('id, number, walk_in_name, input, status, total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .or(`number.ilike.${like},walk_in_name.ilike.${like},input->billTo->>name.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(4);
    if (error) throw new InternalError(error);
    for (const r of data ?? []) {
      const input = (r.input ?? {}) as { billTo?: { name?: string } };
      hits.push({
        kind: 'estimate',
        id: String(r.id),
        title: r.number ? String(r.number) : 'Draft estimate',
        subtitle: `${input.billTo?.name || String(r.walk_in_name ?? '')} - ${Money.parseRounded(String(r.total)).toDbString()} - ${String(r.status)}`,
        href: `/estimates/${String(r.id)}`,
      });
    }
  }
  if (credits) {
    const { data, error } = await admin
      .from('credit_notes')
      .select('id, number, walk_in_name, bill_to, status, total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .or(`number.ilike.${like},walk_in_name.ilike.${like},bill_to->>name.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(4);
    if (error) throw new InternalError(error);
    for (const r of data ?? []) {
      const bill = (r.bill_to ?? {}) as { name?: string };
      hits.push({
        kind: 'credit_note',
        id: String(r.id),
        title: r.number ? String(r.number) : 'Draft credit note',
        subtitle: `${bill.name || String(r.walk_in_name ?? '')} - ${Money.parseRounded(String(r.total)).toDbString()} - ${String(r.status)}`,
        href: `/credit-notes/${String(r.id)}`,
      });
    }
  }
  if (projects) {
    const { data, error } = await admin
      .from('projects')
      .select('id, name, code, status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .or(`name.ilike.${like},code.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(4);
    if (error) throw new InternalError(error);
    for (const r of data ?? [])
      hits.push({
        kind: 'project',
        id: String(r.id),
        title: String(r.name),
        subtitle: `${r.code ? `${String(r.code)} - ` : ''}${String(r.status)}`,
        href: `/projects/${String(r.id)}`,
      });
  }
  return hits;
}
