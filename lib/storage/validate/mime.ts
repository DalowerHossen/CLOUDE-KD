// path: lib/storage/validate/mime.ts
// Cross-check of the real type against the extension and the content type the browser sent.
import { extensionOf } from './name';
import { Reject, type FileKind } from './types';

interface KindInfo {
  mime: string;
  extensions: readonly string[];
  aliases: readonly string[];
}

export const KIND_INFO: Readonly<Record<FileKind, KindInfo>> = {
  png: { mime: 'image/png', extensions: ['png'], aliases: [] },
  jpeg: { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], aliases: ['image/jpg', 'image/pjpeg'] },
  gif: { mime: 'image/gif', extensions: ['gif'], aliases: [] },
  webp: { mime: 'image/webp', extensions: ['webp'], aliases: [] },
  pdf: { mime: 'application/pdf', extensions: ['pdf'], aliases: [] },
  svg: { mime: 'image/svg+xml', extensions: ['svg'], aliases: [] },
  csv: {
    mime: 'text/csv',
    extensions: ['csv'],
    aliases: ['application/csv', 'application/vnd.ms-excel', 'text/plain'],
  },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    aliases: [],
  },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['xlsx'],
    aliases: [],
  },
};

const GENERIC = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

export function checkExtension(name: string, kind: FileKind): void {
  const ext = extensionOf(name);
  if (!KIND_INFO[kind].extensions.includes(ext)) {
    throw new Reject('extension_mismatch', 'The file name does not match the file content.');
  }
}

export function checkDeclaredMime(declared: string | null | undefined, kind: FileKind): void {
  const mime = (declared ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (GENERIC.has(mime)) return;
  const info = KIND_INFO[kind];
  if (mime !== info.mime && !info.aliases.includes(mime)) {
    throw new Reject('mime_mismatch', 'The content type does not match the file content.');
  }
}
