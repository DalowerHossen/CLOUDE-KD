// path: lib/storage/validate/limits.ts
import type { FileCategory } from '@/types/contracts';
import { Reject, type FileKind } from './types';

const MB = 1024 * 1024;

export const UPLOAD_TIMEOUT_MS = 30_000;
export const MAX_IMAGE_PIXELS = 50_000_000;

export function sizeLimit(kind: FileKind, category: FileCategory): number {
  if (category === 'kyc') return 5 * MB;
  switch (kind) {
    case 'pdf':
    case 'docx':
    case 'xlsx':
    case 'csv':
      return 10 * MB;
    default:
      return 5 * MB;
  }
}

/** Types accepted per category. KYC takes images and PDF only; logos take images only. */
export function allowedKinds(category: FileCategory): readonly FileKind[] {
  switch (category) {
    case 'kyc':
      return ['jpeg', 'png', 'webp', 'pdf'];
    case 'logo':
      return ['jpeg', 'png', 'webp', 'gif', 'svg'];
    default:
      return ['jpeg', 'png', 'webp', 'gif', 'svg', 'pdf', 'csv', 'docx', 'xlsx'];
  }
}

export function assertKindAllowed(kind: FileKind, category: FileCategory): void {
  if (!allowedKinds(category).includes(kind)) {
    throw new Reject('type_not_allowed', 'This file type is not allowed here.');
  }
}

export function assertSize(bytes: number, kind: FileKind, category: FileCategory): void {
  if (bytes === 0) throw new Reject('empty', 'The file is empty.');
  if (bytes > sizeLimit(kind, category)) {
    throw new Reject('too_large', `The file is larger than ${sizeLimit(kind, category) / MB} MB.`);
  }
}
