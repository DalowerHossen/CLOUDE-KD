// path: lib/storage/validate/types.ts
import type { FileCategory } from '@/types/contracts';

export type FileKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'pdf' | 'svg' | 'csv' | 'docx' | 'xlsx';

export type RejectCode =
  | 'empty'
  | 'too_large'
  | 'unknown_type'
  | 'type_not_allowed'
  | 'executable'
  | 'extension_mismatch'
  | 'mime_mismatch'
  | 'bad_name'
  | 'polyglot'
  | 'script_content'
  | 'macro'
  | 'archive_bomb'
  | 'archive_path'
  | 'archive_invalid'
  | 'pdf_invalid'
  | 'pdf_encrypted'
  | 'pdf_active_content'
  | 'image_invalid'
  | 'svg_invalid'
  | 'text_invalid'
  | 'timeout';

export interface ValidationInput {
  bytes: Uint8Array;
  /** File name chosen by the user. Only used for the extension cross-check and the safe display name. */
  name: string;
  /** Content type the browser sent, when any. */
  declaredMime?: string | null;
  category: FileCategory;
}

export interface CleanFile {
  bytes: Uint8Array;
  kind: FileKind;
  mimeType: string;
  /** Sanitized display name whose extension matches the final kind. */
  name: string;
  sizeBytes: number;
  contentHash: string;
  /** What was changed on the way, for example "metadata removed". */
  notes: string[];
}

export type ValidationResult =
  { ok: true; file: CleanFile } | { ok: false; code: RejectCode; message: string };

export class Reject extends Error {
  readonly code: RejectCode;
  constructor(code: RejectCode, message: string) {
    super(message);
    this.name = 'Reject';
    this.code = code;
  }
}
