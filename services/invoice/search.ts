// path: services/invoice/search.ts
// The invoice list: search, filters, sorting and cursor pages. The database function does the work and always filters
// by company; this file turns its answer into list rows.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { decodeCursor, encodeCursor, type InvoiceListQuery } from '@/lib/invoice/search';
import type { InvoiceKind } from '@/lib/invoice/input';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { InvoiceStatus } from '@/types/contracts';

export interface InvoiceListItem {
  id: string;
  kind: InvoiceKind;
  number: string | null;
  status: InvoiceStatus;
  clientName: string;
  issueDate: string;
  dueDate: string;
  total: string;
  balance: string;
  poNumber: string;
  deletedAt: string | null;
  /** True when a sent invoice is past its due date and not fully paid. */
  late: boolean;
}

export async function searchInvoices(
  companyId: string,
  query: InvoiceListQuery,
): Promise<{ rows: InvoiceListItem[]; next: string | null }> {
  const admin = getAdminSupabase();
  const cursor = decodeCursor(query.after);
  const size = query.size === '100' ? 100 : query.size === '50' ? 50 : 25;
  const found = await admin.rpc('kd_invoice_search', {
    p_company: companyId,
    p_q: query.q ?? null,
    p_statuses: query.status ? query.status.split(',') : null,
    p_kind: query.kind ?? null,
    p_client: query.client ?? null,
    p_from: query.from ?? null,
    p_to: query.to ?? null,
    p_min: query.min ?? null,
    p_max: query.max ?? null,
    p_trash: query.trash === '1',
    p_sort: query.sort,
    p_desc: query.desc === '1',
    p_after_value: cursor?.v ?? null,
    p_after_id: cursor?.id ?? null,
    p_limit: size + 1,
  });
  if (found.error) throw new InternalError(found.error);
  const hits = (found.data ?? []) as { id: string; sort_value: string }[];
  const page = hits.slice(0, size);
  if (page.length === 0) return { rows: [], next: null };
  const { data, error } = await admin
    .from('invoices')
    .select(
      'id, kind, number, status, bill_to, walk_in_name, issue_date, due_date, total, amount_due, amount_paid, po_number, deleted_at',
    )
    .eq('company_id', companyId)
    .in(
      'id',
      page.map((h) => h.id),
    );
  if (error) throw new InternalError(error);
  const byId = new Map((data ?? []).map((r) => [String(r.id), r]));
  const today = new Date().toISOString().slice(0, 10);
  const rows: InvoiceListItem[] = [];
  for (const h of page) {
    const r = byId.get(h.id);
    if (!r) continue;
    const billTo = (r.bill_to ?? {}) as { name?: string };
    const balance =
      r.status === 'void'
        ? Money.zero()
        : Money.parseRounded(String(r.amount_due)).sub(Money.parseRounded(String(r.amount_paid)));
    const open = ['sent', 'viewed', 'partially_paid', 'overdue', 'disputed'].includes(
      String(r.status),
    );
    rows.push({
      id: String(r.id),
      kind: String(r.kind) as InvoiceKind,
      number: r.number ? String(r.number) : null,
      status: String(r.status) as InvoiceStatus,
      clientName: (billTo.name && billTo.name !== '' ? billTo.name : String(r.walk_in_name)) || '-',
      issueDate: String(r.issue_date),
      dueDate: String(r.due_date),
      total: Money.parseRounded(String(r.total)).toDbString(),
      balance: balance.toDbString(),
      poNumber: String(r.po_number ?? ''),
      deletedAt: r.deleted_at ? String(r.deleted_at) : null,
      late: open && balance.isPositive() && String(r.due_date) < today,
    });
  }
  const last = page[page.length - 1];
  return {
    rows,
    next: hits.length > size && last ? encodeCursor({ v: last.sort_value, id: last.id }) : null,
  };
}
