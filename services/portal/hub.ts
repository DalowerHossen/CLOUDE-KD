// path: services/portal/hub.ts
// The client hub: every invoice that was sent to one client, with a status summary, and an "open" action that makes a
// short-lived invoice link. The hub link carries the client id; every query filters by the company of the link too.
import 'server-only';
import { HUB_OPEN_LINK_DAYS } from '@/config/s13-portal';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { searchInvoices, type InvoiceListItem } from '@/services/invoice/search';
import type { InvoiceStatus } from '@/types/contracts';
import type { PortalSubject } from './events';

/** Statuses the client may see: an invoice that was never sent, or was voided, stays out of the hub. */
export const HUB_STATUSES: readonly InvoiceStatus[] = [
  'sent',
  'viewed',
  'partially_paid',
  'overdue',
  'paid',
  'disputed',
];
const SHOWN = HUB_STATUSES.join(',');
const NOT_SHOWN_KINDS: readonly string[] = ['proforma'];

export interface HubRow {
  id: string;
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  total: string;
  balance: string;
  late: boolean;
}

export interface PortalHub {
  rows: HubRow[];
  /** Open balance of every row shown, in USD. */
  openBalance: string;
  openCount: number;
  paidCount: number;
  overdueCount: number;
  /** True when more invoices exist than the page shows. */
  truncated: boolean;
}

function isOpen(row: { status: InvoiceStatus }): boolean {
  return row.status !== 'paid';
}

export function summarizeHub(rows: readonly HubRow[], truncated: boolean): PortalHub {
  let balance = Money.zero();
  for (const row of rows) if (isOpen(row)) balance = balance.add(Money.parseRounded(row.balance));
  return {
    rows: [...rows],
    openBalance: balance.toDbString(),
    openCount: rows.filter(isOpen).length,
    paidCount: rows.filter((r) => r.status === 'paid').length,
    overdueCount: rows.filter((r) => r.status === 'overdue' || r.late).length,
    truncated,
  };
}

function toRow(item: InvoiceListItem): HubRow {
  return {
    id: item.id,
    number: item.number ?? '',
    status: item.status,
    issueDate: item.issueDate,
    dueDate: item.dueDate,
    total: item.total,
    balance: item.balance,
    late: item.late,
  };
}

export async function getPortalHub(subject: PortalSubject): Promise<PortalHub> {
  const found = await searchInvoices(subject.companyId, {
    client: subject.docId,
    status: SHOWN,
    size: '100',
    sort: 'issue',
    desc: '1',
  });
  const rows = found.rows
    .filter((r) => r.number !== null && !r.deletedAt && !NOT_SHOWN_KINDS.includes(r.kind))
    .map(toRow);
  return summarizeHub(rows, found.next !== null);
}

/** A link to one invoice of this client; the path is returned, the token is shown nowhere else. */
export async function openHubInvoice(subject: PortalSubject, invoiceId: string): Promise<string> {
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .select('id, status, kind')
    .eq('id', invoiceId)
    .eq('company_id', subject.companyId)
    .eq('client_id', subject.docId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) throw new NotFoundError();
  if (!(HUB_STATUSES as readonly string[]).includes(String(data.status))) throw new NotFoundError();
  if (NOT_SHOWN_KINDS.includes(String(data.kind))) throw new NotFoundError();
  const issued = await getService('tokens').issue({
    docType: 'invoice',
    docId: invoiceId,
    companyId: subject.companyId,
    ttlDays: HUB_OPEN_LINK_DAYS,
  });
  return `/i/${issued.token}`;
}
