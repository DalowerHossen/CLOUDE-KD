// path: lib/encryption/blind-index.ts
// Keyed hash that lets an encrypted field be searched for equality (for example a tax id) without storing it in clear.
import { createHmac } from 'node:crypto';
import { deriveDataKey, type RootKeys } from './aead';

/** Trim, NFC, lower case and drop spaces and dashes, so "AB-123 45" and "ab12345" find the same row. */
export function normalizeForIndex(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '');
}

export function blindIndex(roots: RootKeys, version: number, field: string, value: string): string {
  const key = deriveDataKey(roots, version, 'pii', `blind-index:${field}`);
  return createHmac('sha256', key).update(normalizeForIndex(value)).digest('hex');
}
