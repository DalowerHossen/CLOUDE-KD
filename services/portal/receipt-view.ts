// path: services/portal/receipt-view.ts
// The receipt of a payment that was received: the page data, a checksum of the facts shown, and the PDF. A receipt link
// carries the payment id; the payment must belong to the company of the link.
import 'server-only';
import { createElement } from 'react';
import { getServerEnv } from '@/lib/env';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { ReceiptPdf, type ReceiptPdfData } from '@/lib/pdf/receipt-pdf';
import { renderPdf } from '@/lib/pdf/pdf-engine';
import { setupFonts } from '@/lib/pdf/shared/fonts';
import { receiptData, type ReceiptData } from '@/services/payment/receipt-data';
import type { PortalSubject } from './events';
import { receiptChecksum } from './receipt-checksum';

export interface PortalReceipt extends ReceiptData {
  /** First 16 characters of the SHA-256 of the facts, shown on the page and in the PDF. */
  checksum: string;
}

export async function getPortalReceipt(
  companyId: string,
  paymentId: string,
): Promise<PortalReceipt> {
  let data: ReceiptData;
  try {
    data = await receiptData(companyId, paymentId);
  } catch (thrown) {
    // A payment without a receipt (not received, unknown) looks like any unavailable link.
    if (thrown instanceof ValidationError) throw new NotFoundError();
    throw thrown;
  }
  return { ...data, checksum: await receiptChecksum(data) };
}

export function toReceiptPdfData(receipt: PortalReceipt): ReceiptPdfData {
  return {
    reference: receipt.reference,
    paidAt: receipt.paidAt,
    companyName: receipt.companyName,
    clientName: receipt.clientName,
    invoiceNumber: receipt.invoiceNumber,
    amount: receipt.amount,
    surcharge: receipt.surcharge,
    total: receipt.total,
    refunded: receipt.refunded,
    method: receipt.method,
    processorName: receipt.processorName,
    refunds: receipt.refunds,
    checksum: receipt.checksum,
  };
}

export async function renderReceiptPdf(
  companyId: string,
  paymentId: string,
): Promise<{ bytes: Uint8Array; name: string }> {
  setupFonts(getServerEnv().PDF_FONT_DIR);
  const receipt = await getPortalReceipt(companyId, paymentId);
  const out = await renderPdf(createElement(ReceiptPdf, { data: toReceiptPdfData(receipt) }));
  return { bytes: out.bytes, name: `receipt-${receipt.reference}.pdf` };
}

export async function getPortalReceiptPdf(
  subject: PortalSubject,
): Promise<{ bytes: Uint8Array; name: string }> {
  return renderReceiptPdf(subject.companyId, subject.docId);
}
