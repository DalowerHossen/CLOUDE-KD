// path: services/portal/invoice-cancel.ts
// The client cancels an invoice from the invoice link (no account). Only an invoice that was sent, has nothing paid and has no
// payment in progress can be cancelled this way; the invoice becomes void, its payment links stop working, the owner is told, and
// the event is kept on the invoice. A paid or part-paid invoice needs the owner (refund, credit note).
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getInvoice } from '@/services/invoice/invoices';
import { voidCore } from '@/services/invoice/send';
import type { PortalSubject } from './events';

const OPEN_PAYMENT = ['created', 'requires_action', 'authorized', 'pending_review'];
const CANCELLABLE = ['sent', 'viewed', 'overdue'];

export async function cancelInvoiceByClient(
  subject: PortalSubject,
  reason: string,
): Promise<{ status: 'void' }> {
  const companyId = subject.companyId;
  const current = await getInvoice(companyId, subject.docId).catch(() => null);
  if (!current || current.status === 'draft' || current.status === 'pending_approval')
    throw new NotFoundError();
  if (current.status === 'void') return { status: 'void' };
  if (!CANCELLABLE.includes(current.status) || !Money.parse(current.amountPaid).isZero())
    throw new ConflictError(
      'This invoice cannot be cancelled here. Please contact the seller about a refund or a credit.',
    );
  const admin = getAdminSupabase();
  const open = await admin
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('invoice_id', subject.docId)
    .in('status', OPEN_PAYMENT)
    .is('deleted_at', null);
  if (open.error) throw new InternalError(open.error);
  if ((open.count ?? 0) > 0)
    throw new ConflictError(
      'A payment for this invoice is in progress. Try again in a few minutes.',
    );
  const text = reason.trim();
  await voidCore(
    companyId,
    subject.docId,
    text === '' ? 'Cancelled by the client.' : `Cancelled by the client: ${text}`,
    null,
    { acknowledgePayments: false },
  );
  const links = await admin
    .from('payment_links')
    .update({ status: 'revoked' })
    .eq('company_id', companyId)
    .eq('invoice_id', subject.docId)
    .eq('status', 'active');
  if (links.error) throw new InternalError(links.error);
  await getService('notification')
    .notify({
      companyId,
      type: 'invoice.cancelled_by_client',
      title: `Invoice ${current.number ?? ''} was cancelled by the client`.trim(),
      body:
        text === ''
          ? 'The client cancelled the invoice from the invoice link.'
          : text.slice(0, 300),
      href: `/invoices/${subject.docId}`,
    })
    .catch(() => undefined);
  return { status: 'void' };
}
