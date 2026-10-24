// path: lib/storage/validate/magic.ts
// Detects the real type of a file from its content. The file name and the browser content type are never trusted.
export type RawKind =
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'pdf'
  | 'zip'
  | 'svg'
  | 'text'
  | 'executable'
  | 'ole'
  | 'unknown';

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0): boolean =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, from: number, to: number): string =>
  Buffer.from(b.subarray(from, Math.min(to, b.length))).toString('latin1');

const EXECUTABLE_SIGNATURES: readonly (readonly number[])[] = [
  [0x4d, 0x5a], // MZ (Windows PE, DOS)
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xfe, 0xed, 0xfa, 0xce],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe], // Mach-O
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O fat or Java class
  [0x23, 0x21], // #! script
  [0x4b, 0x44, 0x4d], // KDM (virtual disk)
  [0x00, 0x61, 0x73, 0x6d], // WebAssembly
];

/** True when the buffer is valid UTF-8 text without NUL or odd control characters (first 64 KB). */
export function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 65_536);
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return false;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample.subarray(0, sample.length));
    return true;
  } catch {
    // A multi-byte character may be cut at the 64 KB boundary; accept when the cut is the only problem.
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(
        sample.subarray(0, Math.max(0, sample.length - 3)),
      );
      return bytes.length > 65_536;
    } catch {
      return false;
    }
  }
}

export function detectRawKind(bytes: Uint8Array): RawKind {
  if (bytes.length === 0) return 'unknown';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return 'gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
  if (ascii(bytes, 0, 5) === '%PDF-') return 'pdf';
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]))
    return 'zip';
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
  if (EXECUTABLE_SIGNATURES.some((sig) => startsWith(bytes, sig))) return 'executable';
  const bomLength = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  const head = ascii(bytes, bomLength, bomLength + 4096)
    .trimStart()
    .toLowerCase();
  if (head.startsWith('<') && head.includes('<svg')) return 'svg';
  if (looksLikeText(bytes)) return 'text';
  return 'unknown';
}
