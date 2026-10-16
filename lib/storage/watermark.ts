// path: lib/storage/watermark.ts
// Footer mark on export PDFs: product name, tenant reference and date. Lets a leaked export be traced to its company.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function watermarkPdf(bytes: Uint8Array, text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const safe = text.replace(/[^\x20-\x7e]/g, '?').slice(0, 120);
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    const size = 7;
    const textWidth = font.widthOfTextAtSize(safe, size);
    page.drawText(safe, {
      x: Math.max(8, (width - textWidth) / 2),
      y: 10,
      size,
      font,
      color: rgb(0.45, 0.45, 0.45),
      opacity: 0.8,
    });
  }
  return doc.save({ useObjectStreams: false });
}
