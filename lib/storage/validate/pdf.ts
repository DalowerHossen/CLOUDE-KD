// path: lib/storage/validate/pdf.ts
// PDF clean-up. The document is rebuilt page by page in a new file: scripts, launch actions, embedded files, form
// actions and annotations are not copied. Nothing from the original catalog survives.
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { Reject } from './types';

const MAX_PAGES = 500;
const FORBIDDEN_NAMES = [
  '/JavaScript',
  '/JS',
  '/Launch',
  '/EmbeddedFile',
  '/EmbeddedFiles',
  '/OpenAction',
  '/AcroForm',
  '/RichMedia',
  '/XFA',
  '/SubmitForm',
  '/ImportData',
  '/GoToR',
  '/GoToE',
];
/** A PDF name ends at the first character that is not a letter or digit, so "/JS" does not match "/JSON". */
const FORBIDDEN_AFTER = FORBIDDEN_NAMES.map((n) => new RegExp(`${n}(?![A-Za-z0-9#_.-])`));

async function rebuild(bytes: Uint8Array): Promise<{ bytes: Uint8Array; removedActive: boolean }> {
  const raw = Buffer.from(bytes).toString('latin1');
  const hadActive = FORBIDDEN_AFTER.some((re) => re.test(raw));
  if (/\/Encrypt\b/.test(raw))
    throw new Reject('pdf_encrypted', 'Encrypted PDF files are not accepted.');
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
  } catch {
    throw new Reject('pdf_invalid', 'The PDF could not be read.');
  }
  const count = source.getPageCount();
  if (count === 0 || count > MAX_PAGES)
    throw new Reject('pdf_invalid', 'The PDF has an unsupported number of pages.');
  for (const page of source.getPages()) {
    const node = page.node;
    node.delete(PDFName.of('Annots'));
    node.delete(PDFName.of('AA'));
    node.delete(PDFName.of('Metadata'));
    node.delete(PDFName.of('PieceInfo'));
    const resources = node.lookupMaybe(PDFName.of('Resources'), PDFDict);
    resources?.delete(PDFName.of('XObject-Embedded'));
  }
  const target = await PDFDocument.create();
  target.setProducer('KD SOLUTION IT');
  target.setCreator('KD SOLUTION IT');
  const pages = await target.copyPages(source, source.getPageIndices());
  for (const page of pages) target.addPage(page);
  const out = await target.save({ useObjectStreams: false });
  const text = Buffer.from(out).toString('latin1');
  const left = FORBIDDEN_AFTER.find((re) => re.test(text));
  if (left)
    throw new Reject(
      'pdf_active_content',
      'The PDF contains active content that could not be removed.',
    );
  return { bytes: out, removedActive: hadActive };
}

export async function cleanPdf(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; removedActive: boolean }> {
  try {
    return await rebuild(bytes);
  } catch (error) {
    if (error instanceof Reject) throw error;
    throw new Reject('pdf_invalid', 'The PDF could not be read.');
  }
}
