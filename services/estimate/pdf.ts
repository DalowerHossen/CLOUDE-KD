// path: services/estimate/pdf.ts
// The PDF of an estimate: the invoice layout with the title "ESTIMATE", a "valid until" date and no payment details.
import 'server-only';
import { createElement } from 'react';
import { getServerEnv } from '@/lib/env';
import { InvoicePdf } from '@/lib/pdf/invoice-pdf';
import { buildInvoicePdfData, type PdfSeller, type PdfSource } from '@/lib/pdf/invoice/data';
import { renderPdf } from '@/lib/pdf/pdf-engine';
import { setupFonts } from '@/lib/pdf/shared/fonts';
import { prepareInvoice } from '@/services/invoice/prepare';
import { buildSeller } from '@/services/invoice/seller';
import { logoOf } from '@/services/invoice/snapshots';
import { getEstimate } from './estimates';

const WATERMARK: Record<string, 'DRAFT' | 'VOID' | null> = {
  draft: 'DRAFT',
  void: 'VOID',
  declined: 'VOID',
  expired: 'VOID',
};

export async function renderEstimatePdf(companyId: string, id: string): Promise<Uint8Array> {
  setupFonts(getServerEnv().PDF_FONT_DIR);
  const e = await getEstimate(companyId, id, { includeTrashed: true });
  const p = await prepareInvoice(companyId, e.input);
  const seller = (e.seller ?? (await buildSeller(companyId))) as unknown as Partial<PdfSeller>;
  const r = p.result;
  const source: PdfSource = {
    kind: 'invoice',
    number: e.number,
    status: e.status,
    issueDate: e.input.issueDate,
    dueDate: e.validUntil,
    paymentTerms: e.input.paymentTerms,
    document: {
      title: 'ESTIMATE',
      watermark: WATERMARK[e.status] ?? null,
      dueLabel: 'Valid until',
      dueTotalLabel: 'Estimate total',
    },
    poNumber: e.input.poNumber,
    seller: { ...seller, remitTo: null },
    billTo: e.input.billTo,
    walkInName: e.walkInName,
    shipTo: e.input.shipTo,
    notes: e.input.notes,
    paperSize: e.input.paperSize,
    template: e.input.template,
    displayCurrency: e.input.displayCurrency,
    fxRate: p.fx?.rate ?? null,
    reverseCharge: p.reverseCharge,
    taxExempt: p.taxExempt,
    amountPaid: '0.0000',
    totals: {
      subtotal: r.subtotal,
      lineDiscountTotal: r.lineDiscountTotal,
      documentDiscount: r.documentDiscount,
      shipping: r.shipping,
      shippingTax: r.shippingTax,
      taxTotal: r.taxTotal,
      roundingAdjustment: r.roundingAdjustment,
      total: r.total,
      withholding: r.withholding,
      amountDue: r.amountDue,
    },
    taxBreakdown: r.taxBreakdown,
    lines: e.input.lines.map((l, i) => ({
      position: i + 1,
      sku: l.sku,
      description: l.description,
      hsCode: l.hsCode,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      discountKind: l.discountKind,
      discountValue: l.discountValue,
      taxes: (p.calcLines[i]?.taxes ?? []).map((t) => ({ code: t.code, rate: t.rate })),
      taxExempt: l.taxExempt || p.taxExempt || p.reverseCharge,
      net: r.lines[i]?.net ?? '0',
      lineTotal: r.lines[i]?.total ?? '0',
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
