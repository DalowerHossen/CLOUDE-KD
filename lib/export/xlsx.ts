// path: lib/export/xlsx.ts
// Writes a one-sheet Excel workbook (.xlsx) without any library: an .xlsx file is a zip of a few XML files. Text is
// written as text (never as a formula, so a client name that starts with "=" stays a name); amounts and counts are
// written as numbers with a number format; the header row is bold and frozen. Server side only (uses node:zlib).
import { crc32 } from 'node:zlib';
import type { ReportColumn } from '@/lib/reports/types';

const encoder = new TextEncoder();
const NUMBER = /^-?\d{1,18}(\.\d{1,6})?$/;
/** Characters XML 1.0 cannot carry. */
const BAD_XML = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\ufffe\\uffff]', 'g');

function esc(value: string): string {
  return value
    .replace(BAD_XML, '')
    .slice(0, 32_000)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnName(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = (n - (n % 26)) / 26 - 1;
  } while (n >= 0);
  return out;
}

// Style ids in styles.xml below.
const STYLE = {
  header: 1,
  money: 2,
  number: 3,
  totalText: 4,
  totalMoney: 5,
  percent: 6,
  totalNumber: 7,
  totalPercent: 8,
} as const;

function styleFor(type: ReportColumn['type'], total: boolean): number {
  if (type === 'money') return total ? STYLE.totalMoney : STYLE.money;
  if (type === 'number') return total ? STYLE.totalNumber : STYLE.number;
  if (type === 'percent') return total ? STYLE.totalPercent : STYLE.percent;
  return total ? STYLE.totalText : 0;
}

function cell(ref: string, value: string, type: ReportColumn['type'], total: boolean): string {
  const style = styleFor(type, total);
  const s = style === 0 ? '' : ` s="${style}"`;
  if ((type === 'money' || type === 'number' || type === 'percent') && NUMBER.test(value))
    return `<c r="${ref}"${s}><v>${value}</v></c>`;
  if (value === '') return `<c r="${ref}"${s}/>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

export function sheetXml(
  columns: readonly ReportColumn[],
  rows: readonly Record<string, string>[],
  totals: Record<string, string> | null,
  titleLines: readonly string[],
): string {
  const lines: string[] = [];
  let r = 1;
  for (const t of titleLines) {
    lines.push(`<row r="${r}">${cell(`A${r}`, t, 'text', false)}</row>`);
    r += 1;
  }
  const headerRow = r;
  lines.push(
    `<row r="${r}">${columns
      .map(
        (c, i) =>
          `<c r="${columnName(i)}${r}" s="${STYLE.header}" t="inlineStr"><is><t xml:space="preserve">${esc(c.label)}</t></is></c>`,
      )
      .join('')}</row>`,
  );
  r += 1;
  for (const row of rows) {
    lines.push(
      `<row r="${r}">${columns.map((c, i) => cell(`${columnName(i)}${r}`, row[c.key] ?? '', c.type, false)).join('')}</row>`,
    );
    r += 1;
  }
  if (totals) {
    lines.push(
      `<row r="${r}">${columns.map((c, i) => cell(`${columnName(i)}${r}`, totals[c.key] ?? '', c.type, true)).join('')}</row>`,
    );
    r += 1;
  }
  const widths = columns
    .map((c, i) => {
      const longest = Math.max(
        c.label.length,
        ...rows.slice(0, 200).map((x) => (x[c.key] ?? '').length),
      );
      const w = Math.min(60, Math.max(10, longest + 2));
      return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths}</cols><sheetData>${lines.join('')}</sheetData></worksheet>`
  );
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="9">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  '<xf numFmtId="2" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** A zip archive that stores the files without compression (valid for every reader; the files are small XML). */
export function zipStore(files: readonly ZipEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = encoder.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x0021, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 20, true);
    head.setUint16(8, 0x0800, true);
    head.setUint16(10, 0, true);
    head.setUint16(12, 0, true);
    head.setUint16(14, 0x0021, true);
    head.setUint32(16, crc, true);
    head.setUint32(20, f.data.length, true);
    head.setUint32(24, f.data.length, true);
    head.setUint16(28, name.length, true);
    head.setUint32(42, offset, true);
    central.push(new Uint8Array(head.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function buildXlsx(input: {
  sheetName: string;
  columns: readonly ReportColumn[];
  rows: readonly Record<string, string>[];
  totals: Record<string, string> | null;
  titleLines: readonly string[];
}): Uint8Array {
  const name = esc(input.sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Report');
  const files: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: encoder.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: encoder.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encoder.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      ),
    },
    { name: 'xl/styles.xml', data: encoder.encode(STYLES_XML) },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: encoder.encode(sheetXml(input.columns, input.rows, input.totals, input.titleLines)),
    },
  ];
  return zipStore(files);
}
