// path: lib/pdf/pdf-engine.ts
// The PDF engine: renders a React-PDF document to bytes, checks the size and gives the checksum. Other STEPs add
// their own kinds (receipt, payslip, evidence pack) with `registerPdfRenderer`; the `pdf` contract calls them by kind.
import { createHash } from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { PdfKind } from '@/types/contracts';

/** Largest PDF the platform produces. Bigger documents are refused with a clear message. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export class PdfTooLargeError extends Error {
  constructor() {
    super('The PDF is larger than 10 MB.');
  }
}

export interface RenderedPdf {
  bytes: Uint8Array;
  sha256: string;
}

/** Renders a document element. The element must be a react-pdf <Document>. */
export async function renderPdf(element: ReactElement): Promise<RenderedPdf> {
  const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
  if (buffer.length > MAX_PDF_BYTES) throw new PdfTooLargeError();
  return {
    bytes: new Uint8Array(buffer),
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

export type PdfRenderer = (data: Record<string, unknown>) => Promise<Uint8Array>;
const renderers = new Map<PdfKind, PdfRenderer>();

export function registerPdfRenderer(kind: PdfKind, renderer: PdfRenderer): void {
  renderers.set(kind, renderer);
}

export function pdfRendererFor(kind: PdfKind): PdfRenderer | undefined {
  return renderers.get(kind);
}
