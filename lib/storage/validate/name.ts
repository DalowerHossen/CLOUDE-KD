// path: lib/storage/validate/name.ts
// File names: no path parts, no control or special characters, no double extensions that hide a type.
import { Reject } from './types';

const DANGEROUS_EXTENSIONS = new Set([
  'exe',
  'dll',
  'bat',
  'cmd',
  'com',
  'scr',
  'msi',
  'ps1',
  'vbs',
  'js',
  'mjs',
  'jar',
  'sh',
  'php',
  'phtml',
  'asp',
  'aspx',
  'jsp',
  'py',
  'pl',
  'rb',
  'html',
  'htm',
  'xhtml',
  'svgz',
  'hta',
  'lnk',
  'app',
  'apk',
  'deb',
  'rpm',
]);

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** Returns the display name without directories, with only letters, digits, dot, dash, underscore and space. */
export function sanitizeName(raw: string): string {
  const base = (raw.normalize('NFC').split(/[\\/]/).pop() ?? '').replace(/\0/g, '');
  const cleaned = base
    .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\s_-]+/, '')
    .replace(/[\s.]+$/, '')
    .slice(0, 120);
  return cleaned;
}

/** Rejects names that are empty after cleaning, that try a path escape, or that carry a dangerous inner extension. */
export function checkName(raw: string): string {
  if (raw.includes('\0') || /(^|[\\/])\.\.([\\/]|$)/.test(raw)) {
    throw new Reject('bad_name', 'The file name is not allowed.');
  }
  const clean = sanitizeName(raw);
  if (clean.length === 0) throw new Reject('bad_name', 'The file name is not allowed.');
  const parts = clean.toLowerCase().split('.');
  // "invoice.php.png" and similar: every inner extension must be harmless.
  if (
    parts.slice(1, -1).some((p) => DANGEROUS_EXTENSIONS.has(p)) ||
    DANGEROUS_EXTENSIONS.has(parts[parts.length - 1] ?? '')
  ) {
    throw new Reject('bad_name', 'This file type is not allowed.');
  }
  return clean;
}

/** Replaces the extension by the one of the final type, so the stored name never lies about the content. */
export function withExtension(name: string, extension: string): string {
  const stem = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${stem || 'file'}.${extension}`;
}
