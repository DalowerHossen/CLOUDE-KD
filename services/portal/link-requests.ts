// path: services/portal/link-requests.ts
// The owner's side of "my link expired": see the waiting requests and approve (a fresh link goes to the address on file)
// or deny (with a reason; the client is not told, so the form cannot be used to probe). Each request is decided once.
import 'server-only';
import { getService } from '@/lib/container';
import { siteUrl } from '@/lib/cms/site-url';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { PORTAL_ROUTES } from './access';
import { sendClientMail, type ProofDocType } from './client-mail';
import { recipientForDocument } from './recipients';

export interface LinkRequestView {
  id: string;
  docType: string;
  label: string;
  status: 'pending' | 'approved' | 'denied';
  requestedAt: string;
  decidedAt: string | null;
  deniedReason: string;
}

const PROOF_TYPE: Readonly<Record<string, ProofDocType>> = {
  invoice: 'invoice',
  estimate: 'estimate',
  receipt: 'receipt',
  hub: 'hub',
  contract: 'contract',
  payment: 'payment',
};

export async function listLinkRequests(
  companyId: string,
  status?: 'pending' | 'approved' | 'denied',
): Promise<LinkRequestView[]> {
  let q = getAdminSupabase()
    .from('link_requests')
    .select('id, doc_type, doc_id, status, created_at, decided_at, denied_reason')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const rows = data ?? [];
  const out: LinkRequestView[] = [];
  for (const r of rows) {
    const who = await recipientForDocument(
      companyId,
      String(r.doc_type) as never,
      String(r.doc_id),
    ).catch(() => null);
    out.push({
      id: String(r.id),
      docType: String(r.doc_type),
      label: who ? `${who.label} (${who.name})` : String(r.doc_type),
      status: String(r.status) as LinkRequestView['status'],
      requestedAt: String(r.created_at),
      decidedAt: r.decided_at ? String(r.decided_at) : null,
      deniedReason: String(r.denied_reason ?? ''),
    });
  }
  return out;
}

export async function decideLinkRequest(
  actor: Actor,
  id: string,
  decision: 'approve' | 'deny',
  reason: string,
): Promise<LinkRequestView> {
  if (!actor.companyId) throw new NotFoundError();
  const companyId = actor.companyId;
  const admin = getAdminSupabase();
  const { data: request, error } = await admin
    .from('link_requests')
    .select('id, token_id, doc_type, doc_id, status')
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!request) throw new NotFoundError();
  if (request.status !== 'pending') throw new ValidationError('This request was already decided.');
  const now = new Date().toISOString();

  if (decision === 'deny') {
    const denied = await admin
      .from('link_requests')
      .update({
        status: 'denied',
        decided_by: actor.userId,
        decided_at: now,
        denied_reason: reason,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id');
    if (denied.error) throw new InternalError(denied.error);
    if (!denied.data || denied.data.length === 0)
      throw new ValidationError('This request was already decided.');
  } else {
    const who = await recipientForDocument(
      companyId,
      String(request.doc_type) as never,
      String(request.doc_id),
    );
    if (!who) throw new ValidationError('There is no e-mail address on file for this document.');
    // Take the decision first (compare and set), so two owners cannot both send a link.
    const taken = await admin
      .from('link_requests')
      .update({ status: 'approved', decided_by: actor.userId, decided_at: now })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id');
    if (taken.error) throw new InternalError(taken.error);
    if (!taken.data || taken.data.length === 0)
      throw new ValidationError('This request was already decided.');
    try {
      const issued = await getService('tokens').reissue(String(request.token_id));
      const company = await admin
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .maybeSingle();
      await sendClientMail({
        companyId,
        template: 'client.new-link',
        to: who.email,
        data: {
          clientName: who.name,
          companyName: String(company.data?.name ?? ''),
          docLabel: who.label,
          expiresAt: issued.expiresAt.slice(0, 10),
          link: `${siteUrl()}/${linkSegment(String(request.doc_type))}/${encodeURIComponent(issued.token)}`,
        },
        idempotencyKey: `link-request-${id}`,
        doc: { type: PROOF_TYPE[String(request.doc_type)] ?? 'other', id: String(request.doc_id) },
        clientId: who.clientId,
        tokenId: issued.id,
        sentBy: actor.userId,
      });
      await admin.from('link_requests').update({ new_token_id: issued.id }).eq('id', id);
    } catch (thrown) {
      // Put the request back so the owner can try again.
      await admin
        .from('link_requests')
        .update({ status: 'pending', decided_by: null, decided_at: null })
        .eq('id', id);
      throw thrown;
    }
  }
  const [view] = (await listLinkRequests(companyId)).filter((r) => r.id === id);
  if (!view) throw new NotFoundError();
  return view;
}

/** First path segment of the client page for a document type. */
export function linkSegment(docType: string): string {
  const found = Object.entries(PORTAL_ROUTES).find(([, type]) => type === docType);
  return found ? found[0] : 'expired';
}
