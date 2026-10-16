// path: lib/storage/validate/zip.ts
// Safe reader for ZIP containers (Office files). Checks the central directory before anything is inflated and
// bounds every inflate by the declared size, so a lying header cannot cause a decompression bomb.
import { inflateRawSync } from 'node:zlib';
import { Reject } from './types';

export const ZIP_MAX_ENTRIES = 2_000;
export const ZIP_MAX_TOTAL_UNCOMPRESSED = 200 * 1024 * 1024;
export const ZIP_MAX_ENTRY_UNCOMPRESSED = 100 * 1024 * 1024;
export const ZIP_MAX_RATIO = 100;
const MAX_READ_ENTRY = 4 * 1024 * 1024;

export interface ZipEntry {
  name: string;
  method: 0 | 8;
  compressedSize: number;
  size: number;
  offset: number;
  dataStart: number;
}

function invalid(message = 'The archive is damaged.'): Reject {
  return new Reject('archive_invalid', message);
}

function findEndOfCentralDirectory(buf: Buffer): number {
  const min = Math.max(0, buf.length - 22 - 65_535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw invalid();
}

/** Entry names must stay inside the archive: no "..", no absolute path, no drive letter, no backslash, no NUL. */
export function isSafeEntryName(name: string): boolean {
  if (name.length === 0 || name.length > 512) return false;
  if (name.includes('\0') || name.includes('\\')) return false;
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return false;
  return !name.split('/').some((part) => part === '..');
}

export function listZip(bytes: Uint8Array): ZipEntry[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const dirSize = buf.readUInt32LE(eocd + 12);
  const dirOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || dirOffset === 0xffffffff || dirSize === 0xffffffff) {
    throw new Reject('archive_invalid', 'Very large archives are not accepted.');
  }
  if (count > ZIP_MAX_ENTRIES)
    throw new Reject('archive_bomb', 'The archive has too many entries.');
  if (dirOffset + dirSize > eocd) throw invalid();

  const entries: ZipEntry[] = [];
  let p = dirOffset;
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw invalid();
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 1) throw new Reject('archive_invalid', 'Encrypted archives are not accepted.');
    if (method !== 0 && method !== 8) throw invalid('The archive uses an unsupported compression.');
    if (compressedSize === 0xffffffff || size === 0xffffffff)
      throw invalid('Very large archives are not accepted.');
    if (!isSafeEntryName(name))
      throw new Reject('archive_path', 'The archive contains an unsafe path.');
    if (size > ZIP_MAX_ENTRY_UNCOMPRESSED)
      throw new Reject('archive_bomb', 'An archive entry is too large.');
    if (compressedSize > 0 && size / compressedSize > ZIP_MAX_RATIO && size > 1024 * 1024) {
      throw new Reject('archive_bomb', 'The archive compresses suspiciously well.');
    }
    total += size;
    if (total > ZIP_MAX_TOTAL_UNCOMPRESSED)
      throw new Reject('archive_bomb', 'The archive expands too much.');
    if (offset + 30 > buf.length || buf.readUInt32LE(offset) !== 0x04034b50) throw invalid();
    const localName = buf.readUInt16LE(offset + 26);
    const localExtra = buf.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + localName + localExtra;
    if (dataStart + compressedSize > dirOffset) throw invalid();
    entries.push({ name, method, compressedSize, size, offset, dataStart });
  }
  // Overlapping data ranges are the signature of a "quine" bomb that reuses the same bytes for many entries.
  const sorted = [...entries].sort((a, b) => a.dataStart - b.dataStart);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev && cur && prev.dataStart + prev.compressedSize > cur.offset) {
      throw new Reject('archive_bomb', 'The archive entries overlap.');
    }
  }
  const names = new Set<string>();
  for (const e of entries) {
    if (names.has(e.name.toLowerCase())) throw invalid('The archive repeats an entry name.');
    names.add(e.name.toLowerCase());
  }
  return entries;
}

/** Reads one small entry. The inflate is capped at the declared size and the result must match it. */
export function readEntry(bytes: Uint8Array, entry: ZipEntry): Buffer {
  if (entry.size > MAX_READ_ENTRY)
    throw new Reject('archive_bomb', 'An archive entry is too large to inspect.');
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const raw = buf.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  const out =
    entry.method === 0
      ? Buffer.from(raw)
      : inflateRawSync(raw, { maxOutputLength: entry.size + 1 });
  if (out.length !== entry.size)
    throw new Reject('archive_bomb', 'The archive sizes do not match.');
  return out;
}

/** Inflates every entry once with a hard cap, to prove the declared sizes are true. */
export function verifyAllEntries(bytes: Uint8Array, entries: readonly ZipEntry[]): void {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let total = 0;
  for (const e of entries) {
    const raw = buf.subarray(e.dataStart, e.dataStart + e.compressedSize);
    let length: number;
    try {
      length =
        e.method === 0 ? raw.length : inflateRawSync(raw, { maxOutputLength: e.size + 1 }).length;
    } catch {
      throw new Reject('archive_bomb', 'The archive sizes do not match.');
    }
    if (length !== e.size) throw new Reject('archive_bomb', 'The archive sizes do not match.');
    total += length;
    if (total > ZIP_MAX_TOTAL_UNCOMPRESSED)
      throw new Reject('archive_bomb', 'The archive expands too much.');
  }
}
