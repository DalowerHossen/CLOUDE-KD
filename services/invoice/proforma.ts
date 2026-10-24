// path: services/invoice/proforma.ts
// A proforma invoice is a request for payment before the goods or work. When it is time to bill, it becomes a normal
// invoice draft with the same client, lines and taxes; the proforma stays as a record and points to the invoice.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, ValidationError } from '@/lib/errors';
import { dueDateFor } from '@/lib/invoice/terms';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { logInvoiceEvent } from './events';
import { createInvoice, getInvoice, inputOf, type InvoiceView } from './invoices';

export async function convertProforma(actor: Actor, id: string): Promise<InvoiceView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const proforma = await getInvoice(companyId, id);
  if (proforma.kind !== 'proforma')
    throw new ValidationError('Only a proforma invoice can be converted.');
  if (
    proforma.status === 'draft' ||
    proforma.status === 'pending_approval' ||
    proforma.status === 'void'
  )
    throw new ValidationError('Send the proforma first, or write a new invoice.');
  const existing = await getAdminSupabase()
    .from('invoices')
    .select('id')
    .eq('company_id', companyId)
    .eq('parent_invoice_id', id)
    .eq('kind', 'invoice')
    .is('deleted_at', null)
    .limit(1);
  if (existing.error) throw new InternalError(existing.error);
  if ((existing.data ?? []).length > 0)
    throw new ConflictError('This proforma was already converted to an invoice.');
  const today = new Date().toISOString().slice(0, 10);
  const terms = proforma.paymentTerms;
  const invoice = await createInvoice(actor, {
    ...inputOf(proforma),
    kind: 'invoice',
    issueDate: today,
    dueDate: dueDateFor(today, terms, terms === 'custom' ? today : null),
  });
  const r = await getAdminSupabase()
    .from('invoices')
    .update({ parent_invoice_id: id })
    .eq('id', invoice.id)
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .select('id');
  if (r.error) throw new InternalError(r.error);
  await logInvoiceEvent(companyId, id, 'converted', `Converted to an invoice draft`, actor.userId, {
    invoiceId: invoice.id,
  });
  await getService('audit').record({
    action: 'invoice.proforma_converted',
    resourceType: 'invoice',
    resourceId: id,
    companyId,
    metadata: { invoiceId: invoice.id, by: actor.userId },
  });
  return getInvoice(companyId, invoice.id);
}
