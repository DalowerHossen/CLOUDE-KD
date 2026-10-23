// path: services/invoice/events.ts
// The timeline of an invoice: one append-only row for everything that happens to it.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';

export interface InvoiceEventView {
  id: string;
  kind: string;
  message: string;
  actorId: string | null;
  createdAt: string;
}

export async function logInvoiceEvent(
  companyId: string,
  invoiceId: string,
  kind: string,
  message: string,
  actorId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('invoice_events')
    .insert({
      company_id: companyId,
      invoice_id: invoiceId,
      kind,
      message: message.slice(0, 500),
      metadata,
      actor_id: actorId,
    });
  if (error) throw new InternalError(error);
}

export async function listInvoiceEvents(
  companyId: string,
  invoiceId: string,
): Promise<InvoiceEventView[]> {
  const { data, error } = await getAdminSupabase()
    .from('invoice_events')
    .select('id, kind, message, actor_id, created_at')
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(500);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    message: String(r.message),
    actorId: r.actor_id ? String(r.actor_id) : null,
    createdAt: String(r.created_at),
  }));
}
