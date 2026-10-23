// path: scripts/verify/step13-evidence-pdf.mts
// Draws an evidence pack with every section filled, and one with every section empty, and checks that both are real
// PDFs. Run: npx tsx scripts/verify/step13-evidence-pdf.mts
// The layout is bundled to an ES module first: @react-pdf/renderer loads only as ESM, and the project files are CJS.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createElement } from 'react';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const outfile = join(root, 'node_modules/.cache/step13-evidence-pdf/bundle.mjs');
await build({
  stdin: {
    contents: `export * from '@/lib/pdf/evidence-pack-pdf'; export * from '@/lib/pdf/pdf-engine'; export * from '@/lib/pdf/shared/fonts';`,
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
  EvidencePackPdf: Parameters<typeof createElement>[0];
  renderPdf: (element: ReturnType<typeof createElement>) => Promise<{ bytes: Uint8Array }>;
  setupFonts: (dir: string) => void;
};
lib.setupFonts(process.env.PDF_FONT_DIR ?? join(root, 'assets/fonts'));
const hash = (c: string): string => c.repeat(64);
const message = (n: number): Record<string, unknown> => ({
  at: `2026-09-0${n}T08:00:00.000Z`,
  template: 'invoice.sent',
  subject: `Invoice INV-1 (${n})`,
  to: 'c***@example.com',
  document: 'invoice',
  status: 'opened',
  openedAt: `2026-09-0${n}T09:00:00.000Z`,
  clickedAt: null,
  contentHash: hash('a'),
});
const base = {
  generatedAt: '2026-10-18T10:00:00.000Z',
  dispute: {
    id: 'd',
    processorId: 'stripe',
    processorDisputeId: 'dp_1',
    status: 'gathering',
    reasonCode: 'product_not_received',
    reasonCategory: 'product_not_received',
    amount: '100.0000',
    openedAt: '2026-10-17T00:00:00.000Z',
    dueAt: '2026-10-24T00:00:00.000Z',
  },
  invoice: {
    number: 'INV-1',
    status: 'paid',
    clientName: 'Client One',
    issueDate: '2026-09-01',
    dueDate: '2026-09-30',
    total: '100.0000',
    sentAt: '2026-09-01T08:00:00.000Z',
    lines: [{ description: 'Consulting', quantity: '2', unitPrice: '50.0000', total: '100.0000' }],
    snapshotHash: hash('e'),
    snapshotFileId: null,
  },
  receipt: {
    reference: 'PAY-1',
    paidAt: '2026-09-02T10:00:00.000Z',
    amount: '100.0000',
    surcharge: '0.0000',
    total: '100.0000',
    refunded: '0.0000',
    method: 'Card',
    processorName: 'Stripe',
    processorTransactionId: 'ch_1',
  },
  consent: {
    records: [
      {
        at: '2026-09-02T09:59:00.000Z',
        version: '2026-10-18',
        text: 'I have read and accept the invoice terms and the refund policy.',
        textHash: hash('b'),
        ipMasked: '203.0.113.0',
        ip: '203.0.113.9',
        device: 'Chrome on Windows',
        userAgent: 'Mozilla',
      },
    ],
    termsVersion: '2026-10-18',
    refundWindowDays: 180,
    refundPolicyText: 'Refunds are possible for 180 days after the payment.',
  },
  delivery: {
    invoiceMessages: [message(1)],
    acceptances: ['Estimate EST-1 accepted by Client One on 2026-08-28'],
  },
  communications: [message(1), message(2)],
  identity: {
    views: [
      {
        at: '2026-09-01T09:05:00.000Z',
        event: 'view',
        document: 'invoice',
        ipMasked: '203.0.113.0',
        device: 'Chrome on Windows',
      },
    ],
    payerIp: '203.0.113.9',
    payerCountry: 'US',
    cardIdentity: 'A card fingerprint is stored (not shown)',
    threeDs: { authenticated: true, version: '2.2.0' },
  },
  timeline: Array.from({ length: 80 }, (_, i) => ({
    at: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
    source: 'portal',
    text: `Event ${i}`,
  })),
  audit: {
    chainOk: true,
    checkedFrom: '1',
    checkedTo: '40',
    gaps: [],
    entries: Array.from({ length: 30 }, (_, i) => ({
      sequence: String(i + 1),
      at: '2026-09-01T08:00:00.000Z',
      action: 'invoice.sent',
      entryHash: hash('c'),
      prevHash: hash('d'),
    })),
  },
  platform: {
    name: 'KD SOLUTION IT',
    companyName: 'Acme Ltd',
    note: 'This pack was made by the platform from records that cannot be changed afterwards.',
  },
};
const emptyPack = {
  ...base,
  receipt: null,
  consent: { ...base.consent, records: [] },
  delivery: { invoiceMessages: [], acceptances: [] },
  communications: [],
  identity: { views: [], payerIp: null, payerCountry: null, cardIdentity: null, threeDs: {} },
  timeline: [],
  audit: { chainOk: true, checkedFrom: '', checkedTo: '', gaps: [], entries: [] },
};
let checks = 0;
for (const [name, data] of [
  ['full pack', base],
  ['empty pack', emptyPack],
] as const) {
  const out = await lib.renderPdf(createElement(lib.EvidencePackPdf, { data }));
  assert.equal(Buffer.from(out.bytes.slice(0, 5)).toString('latin1'), '%PDF-', name);
  assert.ok(out.bytes.length > 2000, `${name} has content`);
  checks += 1;
}
process.stdout.write(`step13-evidence-pdf: ${checks} checks passed\n`);
