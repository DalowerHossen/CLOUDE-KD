// path: lib/storage/validate/pipeline.ts
// The validation pipeline every upload passes before it is encrypted and stored. Pure: bytes in, clean bytes out.
import { createHash } from 'node:crypto';
import { reencodeImage } from './image';
import { UPLOAD_TIMEOUT_MS, assertKindAllowed, assertSize } from './limits';
import { detectRawKind } from './magic';
import { KIND_INFO, checkDeclaredMime, checkExtension } from './mime';
import { checkName, withExtension } from './name';
import { inspectOffice } from './office';
import { cleanPdf } from './pdf';
import { assertNoPolyglot, assertTextClean } from './polyglot';
import { rasterizeSvg } from './svg';
import {
  Reject,
  type CleanFile,
  type FileKind,
  type ValidationInput,
  type ValidationResult,
} from './types';

function rawToKind(raw: ReturnType<typeof detectRawKind>, name: string): FileKind {
  switch (raw) {
    case 'png':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'pdf':
    case 'svg':
      return raw;
    case 'text':
      return 'csv';
    case 'zip':
      // The exact Office type is decided after the archive was inspected.
      return name.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'docx';
    case 'executable':
      throw new Reject('executable', 'Programs and scripts are not accepted.');
    case 'ole':
      throw new Reject(
        'macro',
        'Old Office formats are not accepted. Save the file as DOCX or XLSX.',
      );
    case 'unknown':
      throw new Reject('unknown_type', 'The file type is not recognised.');
  }
}

export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function run(input: ValidationInput): Promise<CleanFile> {
  const safeName = checkName(input.name);
  if (input.bytes.length === 0) throw new Reject('empty', 'The file is empty.');
  const raw = detectRawKind(input.bytes);
  let kind = rawToKind(raw, safeName);
  // The size limit of the claimed type applies before any work is done on the bytes.
  assertSize(input.bytes.length, kind, input.category);
  assertNoPolyglot(input.bytes, raw);
  const notes: string[] = [];
  let out: Uint8Array = input.bytes;

  if (raw === 'zip') {
    kind = inspectOffice(input.bytes);
    assertSize(input.bytes.length, kind, input.category);
  }
  checkDeclaredMime(input.declaredMime, kind);
  // An SVG stays an SVG for the extension check but is stored as the PNG it is turned into.
  checkExtension(safeName, kind);
  assertKindAllowed(kind, input.category);

  let finalKind = kind;
  switch (kind) {
    case 'png':
    case 'jpeg':
    case 'gif':
    case 'webp': {
      const r = await reencodeImage(input.bytes, kind);
      out = r.bytes;
      notes.push(r.removedMetadata ? 'metadata removed, image re-encoded' : 'image re-encoded');
      break;
    }
    case 'svg':
      out = await rasterizeSvg(input.bytes);
      finalKind = 'png';
      notes.push('vector image converted to PNG');
      break;
    case 'pdf': {
      const r = await cleanPdf(input.bytes);
      out = r.bytes;
      notes.push(r.removedActive ? 'active content removed' : 'document rebuilt');
      break;
    }
    case 'csv': {
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes);
      } catch {
        throw new Reject('text_invalid', 'The file is not valid UTF-8 text.');
      }
      assertTextClean(text);
      break;
    }
    case 'docx':
    case 'xlsx':
      break;
  }
  assertSize(out.length, finalKind, input.category);
  return {
    bytes: out,
    kind: finalKind,
    mimeType: KIND_INFO[finalKind].mime,
    name: withExtension(safeName, KIND_INFO[finalKind].extensions[0] ?? 'bin'),
    sizeBytes: out.length,
    contentHash: contentHash(out),
    notes,
  };
}

/** Never throws for bad input: the answer says why the file was refused. Stops after 30 seconds. */
export async function validateUpload(input: ValidationInput): Promise<ValidationResult> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Reject('timeout', 'The file check took too long.')),
        UPLOAD_TIMEOUT_MS,
      );
    });
    const file = await Promise.race([run(input), timeout]);
    return { ok: true, file };
  } catch (error) {
    if (error instanceof Reject) return { ok: false, code: error.code, message: error.message };
    return { ok: false, code: 'unknown_type', message: 'The file could not be checked.' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
