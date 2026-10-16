// path: lib/storage/validate/office.ts
// DOCX and XLSX checks. Files with macros, embedded objects or remote templates are rejected, not repaired:
// rewriting an Office package would keep the risk of an incomplete clean-up.
import { listZip, readEntry, verifyAllEntries } from './zip';
import { Reject, type FileKind } from './types';

const FORBIDDEN_PART =
  /(^|\/)(vbaproject\.bin|vbadata\.xml|activex\/|embeddings\/|macrosheets\/|dialogsheets\/|externallinks\/|oleobject\d*\.bin)|\.(exe|dll|js|vbs|bat|cmd|ps1|sh|jar|com|scr)$/i;
const FORBIDDEN_RELATIONSHIP =
  /Type="[^"]*\/(attachedTemplate|oleObject|frame|externalLink|package)"[^>]*TargetMode="External"|TargetMode="External"[^>]*Type="[^"]*\/(attachedTemplate|oleObject|frame|externalLink|package)"/i;

export function inspectOffice(bytes: Uint8Array): FileKind {
  const entries = listZip(bytes);
  verifyAllEntries(bytes, entries);
  const names = entries.map((e) => e.name);
  const types = entries.find((e) => e.name === '[Content_Types].xml');
  if (!types) throw new Reject('archive_invalid', 'This is not an Office document.');
  for (const n of names) {
    if (FORBIDDEN_PART.test(n))
      throw new Reject('macro', 'Documents with macros or embedded objects are not accepted.');
  }
  const typesXml = readEntry(bytes, types).toString('utf8');
  if (/macroEnabled|vbaProject/i.test(typesXml)) {
    throw new Reject('macro', 'Documents with macros are not accepted.');
  }
  for (const e of entries.filter((x) => x.name.endsWith('.rels') && x.size <= 1024 * 1024)) {
    if (FORBIDDEN_RELATIONSHIP.test(readEntry(bytes, e).toString('utf8'))) {
      throw new Reject('macro', 'Documents that load outside content are not accepted.');
    }
  }
  if (names.includes('word/document.xml')) return 'docx';
  if (names.includes('xl/workbook.xml')) return 'xlsx';
  throw new Reject('type_not_allowed', 'Only Word and Excel documents are accepted.');
}
