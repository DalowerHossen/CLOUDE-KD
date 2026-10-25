// path: services/portal/invoice-view.ts
// What the client sees of an invoice: the same data the PDF is drawn from, plus the state the page needs (can the client
// pay, how far the invoice is). Only invoices that were sent are shown; a draft or a pending one is "not found".
import 'server-only';
import { Money } from '@/lib/utils/currency';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import type { PdfInvoiceData } from '@/lib/pdf/invoice/data';
import { invoicePdfData, readSnapshot } from '@/services/invoice/snapshots';
import { recordInvoiceViewed } from '@/services/invoice/payments';
import type { InvoiceStatus } from '@/types/contracts';
import type { PortalSubject } from './events';

const PAYABLE: readonly InvoiceStatus[] = ['sent', 'viewed', 'partially_paid', 'overdue'];

export interface PortalInvoice {
  data: PdfInvoiceData;
  status: InvoiceStatus;
  canPay: boolean;
  /** Nothing is paid and no payment runs: the client may cancel the invoice from the page. */
  canCancel: boolean;
  /** Steps of the invoice life for the timeline. */
  steps: { sent: boolean; viewed: boolean; paid: boolean };
}

export async function getPortalInvoice(subject: PortalSubject): Promise<PortalInvoice> {
  const state = await getService('invoices').getForPayment(subject.docId);
  if (state.companyId !== subject.companyId) throw new NotFoundError();
  if (state.status === 'draft' || state.status === 'pending_approval') throw new NotFoundError();
  await recordInvoiceViewed(subject.docId);
  const data = await invoicePdfData(subject.companyId, subject.docId);
  const status = (await getService('invoices').getForPayment(subject.docId)).status;
  const paidAny = !Money.parse(data.totals.paid).isZero();
  return {
    data,
    status,
    canPay: PAYABLE.includes(status) && state.amountDue.gt('0'),
    canCancel:
      (status === 'sent' || status === 'viewed' || status === 'overdue') &&
      state.amountDue.gt('0') &&
      !paidAny,
    steps: {
      sent: true,
      viewed: status !== 'sent',
      paid: status === 'paid',
    },
  };
}

/** The PDF the client gets: the stored snapshot of what was sent. */
export async function getPortalInvoicePdf(
  subject: PortalSubject,
): Promise<{ bytes: Uint8Array; name: string }> {
  const state = await getService('invoices').getForPayment(subject.docId);
  if (state.companyId !== subject.companyId) throw new NotFoundError();
  if (state.status === 'draft' || state.status === 'pending_approval') throw new NotFoundError();
  const stored = await readSnapshot(subject.companyId, subject.docId);
  if (!stored) throw new NotFoundError();
  return { bytes: stored.bytes, name: stored.name };
}
