// path: scripts/verify/step09-pdf.mts
// Draws sample invoices in all four looks and both paper sizes (short, long with 120 lines, Unicode text, watermark)
// and checks that each result is a real PDF of a sensible size. Run: npx tsx scripts/verify/step09-pdf.mts
// The layout is bundled to an ES module first: @react-pdf/renderer loads only as ESM, and the project files are CJS.
import { build } from 'esbuild';
import { createElement } from 'react';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PdfSource } from '../../lib/pdf/invoice/data';

const root = process.cwd();
const outfile = join(root, 'node_modules/.cache/step09-pdf/bundle.mjs');
await build({
  stdin: {
    contents: `export * from '@/lib/pdf/invoice-pdf'; export * from '@/lib/pdf/pdf-engine'; export * from '@/lib/pdf/shared/fonts'; export * from '@/lib/pdf/invoice/data';`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  alias: { '@': root },
  jsx: 'automatic',
  outfile,
  logLevel: 'error',
});
const lib = (await import(pathToFileURL(outfile).href)) as {
  InvoicePdf: Parameters<typeof createElement>[0];
  renderPdf: (
    e: ReturnType<typeof createElement>,
  ) => Promise<{ bytes: Uint8Array; sha256: string }>;
  safeText: (t: string) => string;
  buildInvoicePdfData: (s: PdfSource) => { watermark: string | null };
};
const { InvoicePdf, renderPdf, safeText, buildInvoicePdfData } = lib;

let failed = 0;
function check(name: string, ok: boolean): void {
  process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${name}\n`);
  if (!ok) failed += 1;
}

const addr = {
  name: 'Buyer Ltd',
  contactName: 'Jo',
  email: '',
  phone: '',
  taxLabel: 'VAT',
  taxId: 'X1',
  line1: '1 Main St',
  line2: '',
  city: 'Town',
  region: '',
  postalCode: '10001',
  country: 'US' as const,
};

function source(
  lines: number,
  template: PdfSource['template'],
  paper: 'a4' | 'letter',
  status: string,
): PdfSource {
  return {
    kind: 'invoice',
    number: 'INV-000001',
    status,
    issueDate: '2026-01-01',
    dueDate: '2026-01-31',
    paymentTerms: { type: 'net', days: 30 } as unknown as PdfSource['paymentTerms'],
    poNumber: 'PO-77',
    seller: { name: 'Seller Inc', primaryColor: '#111827', accentColor: '#2563eb', remitTo: null },
    billTo: addr,
    walkInName: '',
    shipTo: addr,
    notes: `Thank you. ${String.fromCharCode(0x9ac, 0x9be)} test`,
    paperSize: paper,
    template,
    displayCurrency: null,
    fxRate: null,
    reverseCharge: false,
    taxExempt: false,
    amountPaid: '0.0000',
    totals: {
      subtotal: '1000.0000',
      lineDiscountTotal: '0.0000',
      documentDiscount: '0.0000',
      shipping: '0.0000',
      shippingTax: '0.0000',
      taxTotal: '100.0000',
      roundingAdjustment: '0.0000',
      total: '1100.0000',
      withholding: '0.0000',
      amountDue: '1100.0000',
    },
    taxBreakdown: [{ code: 'VAT', rate: '10.0000', base: '1000.0000', amount: '100.0000' }],
    lines: Array.from({ length: lines }, (_, i) => ({
      position: i + 1,
      sku: `SKU-${i}`,
      description: `Consulting work item ${i + 1}`,
      hsCode: '',
      quantity: '1.0000',
      unit: 'hr',
      unitPrice: '10.0000',
      discountKind: 'none',
      discountValue: '0.0000',
      taxes: [{ code: 'VAT', rate: '10.0000' }],
      taxExempt: false,
      net: '10.0000',
      lineTotal: '11.0000',
    })),
  };
}

for (const template of ['classic', 'modern', 'minimal', 'detailed'] as const) {
  for (const paper of ['a4', 'letter'] as const) {
    const data = buildInvoicePdfData(source(3, template, paper, 'sent'));
    const out = await renderPdf(createElement(InvoicePdf, { data, logo: null }));
    const head = Buffer.from(out.bytes.slice(0, 5)).toString('latin1');
    check(`${template}/${paper} is a PDF`, head === '%PDF-' && out.bytes.length > 1500);
  }
}
const long = buildInvoicePdfData(source(120, 'classic', 'a4', 'draft'));
check('draft has a DRAFT watermark', long.watermark === 'DRAFT');
const big = await renderPdf(createElement(InvoicePdf, { data: long, logo: null }));
const text = Buffer.from(big.bytes).toString('latin1');
const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
check(`120 lines flow onto several pages (${pages})`, pages >= 3);
check('same data gives a PDF with a checksum', big.sha256.length === 64);
check('non-Latin text is replaced safely', safeText(`a${String.fromCharCode(0x9ac)}`) === 'a?');
const paid = buildInvoicePdfData(source(1, 'classic', 'a4', 'paid'));
check('paid watermark', paid.watermark === 'PAID');
process.stdout.write(failed === 0 ? 'PDF checks passed\n' : `${failed} checks failed\n`);
process.exit(failed === 0 ? 0 : 1);
