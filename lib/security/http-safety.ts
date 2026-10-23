// path: lib/security/http-safety.ts
// Header injection and size helpers.

/** Removes CR, LF and NUL so a value can never end a header line (response splitting). */
export function stripHeaderInjection(value: string): string {
  return value.replace(/[\r\n\u0000]+/g, ' ').trim();
}

export function hasHeaderInjection(value: string): boolean {
  return /[\r\n\u0000]/.test(value);
}

/** Content-Disposition file name that cannot break out of the header or the directory. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f"\;]/g, '')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'file';
}

export function contentLengthTooLarge(header: string | null, limit: number): boolean {
  if (header === null || !/^\d{1,12}$/.test(header)) return false;
  return Number.parseInt(header, 10) > limit;
}
