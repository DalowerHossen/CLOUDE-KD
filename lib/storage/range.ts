// path: lib/storage/range.ts
// HTTP Range header (single range) for large file downloads (feature 3463).
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return 'invalid';
  const [, a = '', b = ''] = match;
  if (a === '' && b === '') return 'invalid';
  let start: number;
  let end: number;
  if (a === '') {
    const suffix = Number.parseInt(b, 10);
    if (suffix === 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number.parseInt(a, 10);
    end = b === '' ? size - 1 : Math.min(Number.parseInt(b, 10), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}
