// path: lib/storage/validate/polyglot.ts
// Files that are valid as more than one type. They pass one parser and run as something else in another.
import { Reject } from './types';
import type { RawKind } from './magic';

const TEXT_MARKERS = [
  '<script',
  '<?php',
  '<%',
  '#!/bin',
  '#!/usr',
  '<html',
  '<iframe',
  'javascript:',
  'powershell',
  'cmd.exe',
];

const BINARY_MARKERS: { name: string; bytes: number[] }[] = [
  { name: 'zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { name: 'pe', bytes: [0x4d, 0x5a, 0x90, 0x00] },
  { name: 'elf', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: 'ole', bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
];

function includesBytes(hay: Buffer, needle: readonly number[], from = 0): boolean {
  return hay.indexOf(Buffer.from(needle), from) !== -1;
}

/** Position after the last byte the format itself uses (IEND chunk, EOI marker, GIF trailer), or -1 when unknown. */
function endOfImage(buf: Buffer, kind: RawKind): number {
  if (kind === 'png') {
    const i = buf.lastIndexOf(Buffer.from('IEND'));
    return i === -1 ? -1 : i + 4 + 4;
  }
  if (kind === 'jpeg') {
    const i = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
    return i === -1 ? -1 : i + 2;
  }
  if (kind === 'gif') {
    const i = buf.lastIndexOf(0x3b);
    return i === -1 ? -1 : i + 1;
  }
  return -1;
}

/**
 * Raw input check. Images and PDFs are rebuilt afterwards, so this looks only at what a rebuild could hide
 * from a viewer: data after the end of the image, other formats in the head or tail, and script text.
 */
export function assertNoPolyglot(bytes: Uint8Array, kind: RawKind): void {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isImage = kind === 'png' || kind === 'jpeg' || kind === 'gif' || kind === 'webp';
  if (isImage || kind === 'pdf') {
    const lower = buf.toString('latin1').toLowerCase();
    for (const m of TEXT_MARKERS) {
      if (lower.includes(m))
        throw new Reject('polyglot', 'The file contains hidden script content.');
    }
  }
  if (isImage) {
    const end = endOfImage(buf, kind);
    if (end !== -1 && buf.length - end > 16) {
      throw new Reject('polyglot', 'The file has extra data after the image.');
    }
    const body = buf.subarray(8);
    for (const m of BINARY_MARKERS) {
      if (
        includesBytes(body.subarray(0, 2048), m.bytes) ||
        includesBytes(body.subarray(Math.max(0, body.length - 4096)), m.bytes)
      ) {
        throw new Reject('polyglot', `The file also looks like a ${m.name} file.`);
      }
    }
  }
  if (kind === 'pdf') {
    // A ZIP or program header in the last kilobytes of a PDF is the classic appended payload.
    const tail = buf.subarray(Math.max(0, buf.length - 4096));
    for (const m of BINARY_MARKERS.filter((x) => x.name !== 'pdf')) {
      if (includesBytes(tail, m.bytes))
        throw new Reject('polyglot', `The file also looks like a ${m.name} file.`);
    }
    const eof = buf.lastIndexOf(Buffer.from('%%EOF'));
    if (eof !== -1 && buf.length - eof > 1024)
      throw new Reject('polyglot', 'The file has extra data after the document.');
  }
}

/** Text-based inputs (CSV): no script markers. */
export function assertTextClean(text: string): void {
  const lower = text.toLowerCase();
  for (const m of TEXT_MARKERS.filter((x) => x !== '<%')) {
    if (lower.includes(m)) throw new Reject('script_content', 'The file contains script content.');
  }
}
