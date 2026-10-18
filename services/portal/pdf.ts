// path: services/portal/pdf.ts
// One door for the PDF a client downloads: the document type of the link decides which file it is.
import 'server-only';
import { NotFoundError } from '@/lib/errors';
import { getSignedCopy } from '@/services/esign/sign';
import type { PortalSubject } from './events';
import { getPortalEstimatePdf } from './estimate-view';
import { getPortalInvoicePdf } from './invoice-view';
import { getPortalReceiptPdf } from './receipt-view';

export const PDF_DOC_TYPES = ['invoice', 'estimate', 'receipt', 'contract'] as const;

export async function getPortalPdf(
  subject: PortalSubject,
  token: string,
): Promise<{ bytes: Uint8Array; name: string }> {
  switch (subject.docType) {
    case 'invoice':
      return getPortalInvoicePdf(subject);
    case 'estimate':
      return getPortalEstimatePdf(subject, token);
    case 'receipt':
      return getPortalReceiptPdf(subject);
    case 'contract':
      return getSignedCopy(subject);
    default:
      throw new NotFoundError();
  }
}
