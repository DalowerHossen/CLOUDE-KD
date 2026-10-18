// path: scripts/verify/step13-signed-pdf.mts
// Draws a signed contract (typed and drawn signatures, long wording over several pages) and checks that it is a real PDF
// of a sensible size. Run: npx tsx scripts/verify/step13-signed-pdf.mts
// The layout is bundled to an ES module first: @react-pdf/renderer loads only as ESM, and the project files are CJS.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createElement } from 'react';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const root = process.cwd();
const outfile = join(root, 'node_modules/.cache/step13-signed-pdf/bundle.mjs');
await build({
  stdin: {
    contents: `export * from '@/services/esign/contract-pdf'; export * from '@/lib/pdf/pdf-engine'; export * from '@/lib/pdf/shared/fonts';`,
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
  SignedContractPdf: Parameters<typeof createElement>[0];
  renderPdf: (element: ReturnType<typeof createElement>) => Promise<{ bytes: Uint8Array }>;
  setupFonts: (dir: string) => void;
};
lib.setupFonts(process.env.PDF_FONT_DIR ?? join(root, 'assets/fonts'));
const picture = await sharp({
  create: { width: 300, height: 100, channels: 3, background: '#223344' },
})
  .png()
  .toBuffer();
const signer = (position: number, method: 'typed' | 'drawn'): Record<string, unknown> => ({
  position,
  name: `Signer ${position}`,
  email: `signer${position}@example.com`,
  roleLabel: position === 1 ? 'Client' : '',
  method,
  typedName: `Signer ${position}`,
  signedAt: '2026-10-18T09:30:00.000Z',
  ipMasked: '203.0.113.0',
  device: 'Chrome on Windows',
  recordHash: 'c'.repeat(64),
  image: method === 'drawn' ? { data: picture, format: 'png' as const } : null,
});
const base = {
  number: 'CT-000001',
  title: 'Service agreement',
  companyName: 'Acme Ltd',
  clientName: 'Client One',
  docHash: 'a'.repeat(64),
  sentAt: '2026-10-17T08:00:00.000Z',
  signedAt: '2026-10-18T09:30:00.000Z',
  statement: 'I have read this contract and I agree to sign it electronically.',
  statementHash: 'b'.repeat(64),
};
let checks = 0;
for (const [name, paragraphs] of [
  ['short contract', ['One paragraph of wording.']],
  [
    'long contract',
    Array.from(
      { length: 120 },
      (_, i) => `Clause ${i + 1}: the parties agree to the terms of this clause in full.`,
    ),
  ],
] as const) {
  const data = {
    ...base,
    paragraphs: [...paragraphs],
    signers: [signer(1, 'typed'), signer(2, 'drawn')],
  };
  const out = await lib.renderPdf(createElement(lib.SignedContractPdf, { data }));
  assert.equal(Buffer.from(out.bytes.slice(0, 5)).toString('latin1'), '%PDF-', name);
  assert.ok(out.bytes.length > 2000, `${name} has content`);
  checks += 1;
}
process.stdout.write(`step13-signed-pdf: ${checks} checks passed\n`);
