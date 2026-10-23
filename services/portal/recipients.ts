// path: services/portal/recipients.ts
// Who a client message goes to. The address always comes from the client record (or the signer record of a contract),
// never from a request, and the do-not-contact and reminder opt-out flags of STEP 08 are read here once.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { TokenDocumentType } from '@/types/contracts';

export interface ClientContact {
  id: string;
  name: string;
  email: string | null;
  /** Do-not-contact: no optional message of any kind. */
  doNotContact: boolean;
  /** Reminder opt-out: no reminder or follow-up. */
  remindersOptOut: boolean;
}

export async function clientContact(
  companyId: string,
  clientId: string,
): Promise<ClientContact | null> {
  const { data, error } = await getAdminSupabase()
    .from('clients')
    .select('id, name, email, billing_email, do_not_contact, reminders_opt_out')
    .eq('id', clientId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  const email = data.billing_email ?? data.email;
  return {
    id: String(data.id),
    name: String(data.name),
    email: email ? String(email) : null,
    doNotContact: data.do_not_contact === true,
    remindersOptOut: data.reminders_opt_out === true,
  };
}

export interface DocumentRecipient {
  email: string;
  name: string;
  /** For example "invoice INV-0001". */
  label: string;
  clientId: string | null;
}

async function one(
  table: string,
  columns: string,
  companyId: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await getAdminSupabase()
    .from(table)
    .select(columns)
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return (data as unknown as Record<string, unknown> | null) ?? null;
}

async function viaClient(
  companyId: string,
  clientId: string | null,
  label: string,
): Promise<DocumentRecipient | null> {
  if (!clientId) return null;
  const contact = await clientContact(companyId, clientId);
  if (!contact?.email) return null;
  return { email: contact.email, name: contact.name, label, clientId: contact.id };
}

/** The address behind a document link (for a new link after an expired one). Null when there is none to use. */
export async function recipientForDocument(
  companyId: string,
  docType: TokenDocumentType,
  docId: string,
): Promise<DocumentRecipient | null> {
  switch (docType) {
    case 'invoice': {
      const r = await one('invoices', 'client_id, number', companyId, docId);
      return r
        ? viaClient(
            companyId,
            r.client_id ? String(r.client_id) : null,
            `invoice ${String(r.number ?? '')}`.trim(),
          )
        : null;
    }
    case 'estimate': {
      const r = await one('estimates', 'client_id, number', companyId, docId);
      return r
        ? viaClient(
            companyId,
            r.client_id ? String(r.client_id) : null,
            `estimate ${String(r.number ?? '')}`.trim(),
          )
        : null;
    }
    case 'hub':
      return viaClient(companyId, docId, 'your invoices');
    case 'receipt': {
      const p = await one('payments', 'invoice_id', companyId, docId);
      if (!p) return null;
      const i = await one('invoices', 'client_id, number', companyId, String(p.invoice_id));
      return i
        ? viaClient(
            companyId,
            i.client_id ? String(i.client_id) : null,
            `receipt for invoice ${String(i.number ?? '')}`.trim(),
          )
        : null;
    }
    case 'contract': {
      const s = await one('contract_signers', 'email, name, contract_id', companyId, docId);
      if (!s) return null;
      const c = await one('contracts', 'title, client_id', companyId, String(s.contract_id));
      return {
        email: String(s.email),
        name: String(s.name),
        label: `contract ${String(c?.title ?? '')}`.trim(),
        clientId: c?.client_id ? String(c.client_id) : null,
      };
    }
    default:
      return null;
  }
}
