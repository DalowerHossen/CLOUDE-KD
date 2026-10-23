// path: services/whatsapp/recipients.ts
// Finds the client behind an event (from the client id, or through the invoice or payment of the event) and builds the values that
// fill a template: client name, invoice number, total, amount due, due date and payment amount. Reads the tables of STEP 08, 09
// and 10 read only (the way the public API does).
import 'server-only';
import { InternalError } from '@/lib/errors';
import type { TokenContext } from '@/lib/whatsapp/automation-rules';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';

export interface Recipient {
  clientId: string;
  name: string;
  phone: string;
  doNotContact: boolean;
  remindersOptOut: boolean;
  context: TokenContext;
}

export interface EventRefs {
  clientId?: string | undefined;
  invoiceId?: string | undefined;
  paymentId?: string | undefined;
}

const money = (v: unknown): string => Money.parse(String(v ?? 0)).toDbString();
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ids an event payload carries; anything that is not an id is dropped. */
export function refsOf(payload: Record<string, unknown>): EventRefs {
  const pick = (k: string): string | undefined => {
    const v = payload[k];
    return typeof v === 'string' && uuid.test(v) ? v : undefined;
  };
  return { clientId: pick('clientId'), invoiceId: pick('invoiceId'), paymentId: pick('paymentId') };
}

export async function clientContext(
  companyId: string,
  clientId: string,
): Promise<
  | (Pick<Recipient, 'name' | 'phone' | 'doNotContact' | 'remindersOptOut'> & {
      contactName: string;
    })
  | null
> {
  const { data, error } = await getAdminSupabase()
    .from('clients')
    .select('name, contact_name, phone, do_not_contact, reminders_opt_out')
    .eq('company_id', companyId)
    .eq('id', clientId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  return {
    name: text(data.name),
    contactName: text(data.contact_name),
    phone: text(data.phone),
    doNotContact: data.do_not_contact === true,
    remindersOptOut: data.reminders_opt_out === true,
  };
}

/** The recipient of an event: null when no client can be found. */
export async function resolveRecipient(
  companyId: string,
  refs: EventRefs,
): Promise<Recipient | null> {
  const admin = getAdminSupabase();
  const context: Record<string, string> = {};
  let clientId = refs.clientId;
  let invoiceId = refs.invoiceId;
  if (refs.paymentId !== undefined) {
    const p = await admin
      .from('payments')
      .select('amount, invoice_id, client_id')
      .eq('company_id', companyId)
      .eq('id', refs.paymentId)
      .maybeSingle();
    if (p.error) throw new InternalError(p.error);
    if (p.data) {
      context['payment.amount'] = money(p.data.amount);
      invoiceId = invoiceId ?? (p.data.invoice_id ? String(p.data.invoice_id) : undefined);
      clientId = clientId ?? (p.data.client_id ? String(p.data.client_id) : undefined);
    }
  }
  if (invoiceId !== undefined) {
    const i = await admin
      .from('invoices')
      .select('number, total, amount_due, due_date, client_id')
      .eq('company_id', companyId)
      .eq('id', invoiceId)
      .maybeSingle();
    if (i.error) throw new InternalError(i.error);
    if (i.data) {
      context['invoice.number'] = text(i.data.number);
      context['invoice.total'] = money(i.data.total);
      context['invoice.amount_due'] = money(i.data.amount_due);
      context['invoice.due_date'] = text(i.data.due_date);
      clientId = clientId ?? (i.data.client_id ? String(i.data.client_id) : undefined);
    }
  }
  if (clientId === undefined) return null;
  const c = await clientContext(companyId, clientId);
  if (!c) return null;
  context['client.name'] = c.name;
  context['client.contact_name'] = c.contactName === '' ? c.name : c.contactName;
  return {
    clientId,
    name: c.name,
    phone: c.phone,
    doNotContact: c.doNotContact,
    remindersOptOut: c.remindersOptOut,
    context,
  };
}
