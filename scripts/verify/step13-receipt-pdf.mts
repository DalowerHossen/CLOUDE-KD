// path: scripts/verify/step13-receipt-pdf.mts
// Draws a receipt (with and without refunds) and checks that the result is a real PDF. Run: npx tsx scripts/verify/step13-receipt-pdf.mts
// The layout is bundled to an ES module first: @react-pdf/renderer loads only as ESM, and the project files are CJS.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createElement } from 'react';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const outfile = join(root, 'node_modules/.cache/step13-receipt-pdf/bundle.mjs');
await build({
  stdin: {
    contents: `export * from '@/lib/pdf/receipt-pdf'; export * from '@/lib/pdf/pdf-engine'; export * from '@/lib/pdf/shared/fonts';`,
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
  ReceiptPdf: Parameters<typeof createElement>[0];
  renderPdf: (element: ReturnType<typeof createElement>) => Promise<{ bytes: Uint8Array }>;
  setupFonts: (dir: string) => void;
};
lib.setupFonts(process.env.PDF_FONT_DIR ?? join(root, 'assets/fonts'));
const base = {
  reference: 'PAY-0001',
  paidAt: '2026-10-18',
  companyName: 'Acme Ltd',
  clientName: 'Client One',
  invoiceNumber: 'INV-0001',
  amount: '100.0000',
  surcharge: '3.2000',
  total: '103.2000',
  refunded: '0.0000',
  method: 'Card',
  processorName: 'Stripe',
  refunds: [] as { at: string; amount: string }[],
  checksum: '0123456789abcdef',
};
let checks = 0;
for (const [name, data] of [
  ['paid receipt', base],
  [
    'refunded receipt',
    { ...base, refunded: '20.0000', refunds: [{ at: '2026-10-19', amount: '20.0000' }] },
  ],
] as const) {
  const out = await lib.renderPdf(createElement(lib.ReceiptPdf, { data }));
  assert.equal(Buffer.from(out.bytes.slice(0, 5)).toString('latin1'), '%PDF-', name);
  assert.ok(out.bytes.length > 1000, `${name} has content`);
  checks += 1;
}
process.stdout.write(`step13-receipt-pdf: ${checks} checks passed\n`);
