// path: lib/transfer/xlsx.ts
// Reads the first sheet of an .xlsx file without a spreadsheet library: an .xlsx is a ZIP file of XML parts. Only the
// parts that are needed are unpacked, with limits on the number of entries and on the unpacked size, so a crafted
// file cannot use up memory. Values come back as text; dates stay as the serial number the file stores.
import { inflateRawSync } from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';
import { MAX_CELL, MAX_COLUMNS, MAX_ROWS, TransferError } from './csv';

const MAX_ENTRIES = 300;
const MAX_UNPACKED = 25 * 1024 * 1024;

interface Entry {
  method: number;
  compressed: number;
  size: number;
  offset: number;
}

function readZip(buf: Buffer): Map<string, Entry> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i -= 1)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new TransferError('This is not a valid .xlsx file.');
  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || pos === 0xffffffff)
    throw new TransferError('Large zip files are not supported.');
  if (count > MAX_ENTRIES) throw new TransferError('The .xlsx file has too many parts.');
  const entries = new Map<string, Entry>();
  for (let n = 0; n < count; n += 1) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50)
      throw new TransferError('This is not a valid .xlsx file.');
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    entries.set(buf.toString('utf8', pos + 46, pos + 46 + nameLen), {
      method: buf.readUInt16LE(pos + 10),
      compressed: buf.readUInt32LE(pos + 20),
      size: buf.readUInt32LE(pos + 24),
      offset: buf.readUInt32LE(pos + 42),
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function unpack(buf: Buffer, e: Entry): string {
  if (e.size > MAX_UNPACKED) throw new TransferError('A part of the .xlsx file is too large.');
  if (e.offset + 30 > buf.length || buf.readUInt32LE(e.offset) !== 0x04034b50)
    throw new TransferError('This is not a valid .xlsx file.');
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const raw = buf.subarray(start, start + e.compressed);
  if (e.method === 0) return raw.toString('utf8');
  if (e.method !== 8) throw new TransferError('This .xlsx file uses an unsupported packing.');
  try {
    return inflateRawSync(raw, { maxOutputLength: MAX_UNPACKED }).toString('utf8');
  } catch {
    throw new TransferError('A part of the .xlsx file could not be unpacked.');
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (name) => ['si', 'r', 'row', 'c', 'sheet', 'Relationship'].includes(name),
});

type Node = Record<string, unknown>;
const arr = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : v ? [v as Node] : []);
const str = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';

/** Text of a <t> element, which is a string or an object with an xml:space attribute. */
function textOf(t: unknown): string {
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object') return str((t as Node)['#text']);
  return '';
}

function sharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const root = (parser.parse(xml) as Node).sst as Node | undefined;
  return arr(root?.si).map((si) =>
    si.t !== undefined
      ? textOf(si.t)
      : arr(si.r)
          .map((r) => textOf(r.t))
          .join(''),
  );
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

export function readXlsx(bytes: Uint8Array): string[][] {
  const buf = Buffer.from(bytes);
  const zip = readZip(buf);
  const part = (name: string): string | null => {
    const e = zip.get(name);
    return e ? unpack(buf, e) : null;
  };
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = part('xl/workbook.xml');
  const rels = part('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const book = (parser.parse(wb) as Node).workbook as Node | undefined;
    const first = arr((book?.sheets as Node | undefined)?.sheet)[0];
    const rid = first ? str(first['@_r:id']) : '';
    const target = arr(
      ((parser.parse(rels) as Node).Relationships as Node | undefined)?.Relationship,
    ).find((r) => str(r['@_Id']) === rid);
    const t = target ? str(target['@_Target']) : '';
    if (t) sheetPath = t.startsWith('/') ? t.slice(1) : `xl/${t}`;
  }
  const sheetXml = part(sheetPath);
  if (!sheetXml) throw new TransferError('The first sheet of the .xlsx file was not found.');
  const strings = sharedStrings(part('xl/sharedStrings.xml'));
  const sheet = (parser.parse(sheetXml) as Node).worksheet as Node | undefined;
  const data = sheet?.sheetData as Node | undefined;
  const out: string[][] = [];
  for (const row of arr(data?.row)) {
    const rowIndex = Number.parseInt(str(row['@_r']), 10);
    const cells: string[] = [];
    for (const c of arr(row.c)) {
      const idx = columnIndex(str(c['@_r']));
      if (idx < 0 || idx >= MAX_COLUMNS) continue;
      const type = str(c['@_t']);
      let value = '';
      if (type === 's') value = strings[Number.parseInt(str(c.v), 10)] ?? '';
      else if (type === 'inlineStr') {
        const is = c.is as Node | undefined;
        value = is
          ? is.t !== undefined
            ? textOf(is.t)
            : arr(is.r)
                .map((r) => textOf(r.t))
                .join('')
          : '';
      } else if (type === 'b') value = str(c.v) === '1' ? 'TRUE' : 'FALSE';
      else value = textOf(c.v);
      if (value.length > MAX_CELL)
        throw new TransferError('A cell is longer than 2000 characters.');
      while (cells.length < idx) cells.push('');
      cells[idx] = value;
    }
    if (Number.isFinite(rowIndex)) {
      if (rowIndex > MAX_ROWS + 1) throw new TransferError('The file has more than 5000 rows.');
      while (out.length < rowIndex - 1) out.push([]);
    }
    out.push(cells);
    if (out.length > MAX_ROWS + 1) throw new TransferError('The file has more than 5000 rows.');
  }
  return out;
}
