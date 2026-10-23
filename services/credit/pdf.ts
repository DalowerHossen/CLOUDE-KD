// path: services/credit/pdf.ts
// The PDF of a credit note: the invoice layout with the title "CREDIT NOTE" and the credited lines.
import 'server-only';
import { createElement } from 'react';
import { getServerEnv } from '@/lib/env';
import { InvoicePdf } from '@/lib/pdf/invoice-pdf';
import { buildInvoicePdfData, type PdfSeller, type PdfSource } from '@/lib/pdf/invoice/data';
import { renderPdf } from '@/lib/pdf/pdf-engine';
import { setupFonts } from '@/lib/pdf/shared/fonts';
import { getInvoice } from '@/services/invoice/invoices';
import { buildSeller } from '@/services/invoice/seller';
import { logoOf } from '@/services/invoice/snapshots';
import { getCreditNote } from './credit-notes';

export async function renderCreditNotePdf(companyId: string, id: string): Promise<Uint8Array> {
  setupFonts(getServerEnv().PDF_FONT_DIR);
  const c = await getCreditNote(companyId, id);
  const original = await getInvoice(companyId, c.invoiceId, { includeTrashed: true });
  const seller = (c.seller ?? (await buildSeller(companyId))) as unknown as Partial<PdfSeller>;
  const source: PdfSource = {
    kind: 'invoice',
    number: c.number,
    status: c.status,
    issueDate: c.issueDate,
    dueDate: c.issueDate,
    paymentTerms: 'due_on_receipt',
    document: {
      title: 'CREDIT NOTE',
      watermark: c.status === 'draft' ? 'DRAFT' : c.status === 'void' ? 'VOID' : null,
      dueLabel: '',
      dueTotalLabel: 'Credit total',
    },
    poNumber: original.number ? `Invoice ${original.number}` : '',
    seller: { ...seller, remitTo: null },
    billTo: c.billTo,
    walkInName: c.walkInName,
    shipTo: null,
    notes: c.reasonNote,
    paperSize: original.paperSize,
    template: original.template,
    displayCurrency: null,
    fxRate: null,
    reverseCharge: original.reverseCharge,
    taxExempt: original.taxExempt,
    amountPaid: '0.0000',
    totals: {
      subtotal: c.subtotal,
      lineDiscountTotal: '0',
      documentDiscount: '0',
      shipping: '0',
      shippingTax: '0',
      taxTotal: c.taxTotal,
      roundingAdjustment: '0',
      total: c.total,
      withholding: '0',
      amountDue: c.total,
    },
    taxBreakdown: c.taxBreakdown,
    lines: c.lines.map((l) => ({
      position: l.position,
      sku: l.sku,
      description: l.description,
      hsCode: l.hsCode,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      discountKind: l.discountKind,
      discountValue: l.discountValue,
      taxes: l.taxes.map((t) => ({ code: t.code, rate: t.rate })),
      taxExempt: l.taxExempt,
      net: l.net,
      lineTotal: l.total,
    })),
  };
  const data = buildInvoicePdfData(source);
  const logo = await logoOf(
    companyId,
    (seller as { logoFileId?: string | null }).logoFileId ?? null,
  );
  const out = await renderPdf(createElement(InvoicePdf, { data, logo }));
  return out.bytes;
}
