// path: services/portal/delivery-proof.ts
// The owner's view of what was sent to clients: every proof row with the life of the message (sent, delivered, opened,
// clicked, bounced, complained) read from the e-mail tables of STEP 05. The full address is never returned.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';

export interface DeliveryRow {
  id: string;
  template: string;
  docType: string;
  docId: string | null;
  clientId: string | null;
  toMasked: string;
  subject: string;
  sentAt: string;
  /** none, sent, delivered, opened, clicked, bounced or complained (from the e-mail service). */
  status: string;
  openedAt: string | null;
  clickedAt: string | null;
  /** The outbox status: queued, sending, sent, failed or suppressed. */
  outboxStatus: string;
  events: { kind: string; at: string }[];
}

export interface DeliveryQuery {
  docType?: string;
  docId?: string;
  clientId?: string;
  limit?: number;
}

export async function listDeliveries(
  companyId: string,
  query: DeliveryQuery = {},
): Promise<DeliveryRow[]> {
  const admin = getAdminSupabase();
  let proofs = admin
    .from('delivery_proofs')
    .select('id, outbox_id, template, doc_type, doc_id, client_id, to_masked, subject, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(Math.min(query.limit ?? 50, 200));
  if (query.docType) proofs = proofs.eq('doc_type', query.docType);
  if (query.docId) proofs = proofs.eq('doc_id', query.docId);
  if (query.clientId) proofs = proofs.eq('client_id', query.clientId);
  const found = await proofs;
  if (found.error) throw new InternalError(found.error);
  const rows = found.data ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => String(r.outbox_id));
  const [outbox, events] = await Promise.all([
    admin
      .from('email_outbox')
      .select('id, status, delivery_status, sent_at, opened_at, clicked_at')
      .eq('company_id', companyId)
      .in('id', ids),
    admin
      .from('email_events')
      .select('outbox_id, kind, created_at')
      .eq('company_id', companyId)
      .in('outbox_id', ids)
      .order('created_at', { ascending: true }),
  ]);
  if (outbox.error) throw new InternalError(outbox.error);
  if (events.error) throw new InternalError(events.error);
  const byOutbox = new Map((outbox.data ?? []).map((o) => [String(o.id), o]));
  return rows.map((r) => {
    const o = byOutbox.get(String(r.outbox_id));
    return {
      id: String(r.id),
      template: String(r.template),
      docType: String(r.doc_type),
      docId: r.doc_id ? String(r.doc_id) : null,
      clientId: r.client_id ? String(r.client_id) : null,
      toMasked: String(r.to_masked),
      subject: String(r.subject),
      sentAt: String(o?.sent_at ?? r.created_at),
      status: String(o?.delivery_status ?? 'none'),
      openedAt: o?.opened_at ? String(o.opened_at) : null,
      clickedAt: o?.clicked_at ? String(o.clicked_at) : null,
      outboxStatus: String(o?.status ?? 'queued'),
      events: (events.data ?? [])
        .filter((e) => String(e.outbox_id) === String(r.outbox_id))
        .map((e) => ({ kind: String(e.kind), at: String(e.created_at) })),
    };
  });
}
