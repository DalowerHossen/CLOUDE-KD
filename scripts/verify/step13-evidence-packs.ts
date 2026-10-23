// path: scripts/verify/step13-evidence-packs.ts
// Logic checks of stored evidence packs (13.9.b) that need no database or network: the ZIP writer (read back by an
// independent reader and by python's own zip reader), unsafe names, the facts handed to the processor adapter, and the
// retention promise. Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-evidence-packs.ts
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PACK_RETENTION_MONTHS, processorSections } from '@/services/evidence/facts';
import type { EvidencePackData } from '@/services/evidence/types';
import { buildZip, crc32 } from '@/services/evidence/zip';

let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve(fn()).then(
    () => void (checks += 1),
    (error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    },
  );

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

/** A minimal independent reader: walks the central directory and checks every entry against its local header. */
function readZip(zip: Uint8Array): { name: string; data: Uint8Array }[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50, 'end record');
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const out: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    assert.equal(v.getUint32(at, true), 0x02014b50, 'central header');
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 24, true);
    const nameLen = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.slice(at + 46, at + 46 + nameLen));
    assert.equal(v.getUint32(local, true), 0x04034b50, 'local header');
    const localNameLen = v.getUint16(local + 26, true);
    const start = local + 30 + localNameLen;
    const data = zip.slice(start, start + size);
    assert.equal(crc32(data), crc, `crc of ${name}`);
    out.push({ name, data });
    at += 46 + nameLen;
  }
  return out;
}

const sample = (): EvidencePackData =>
  ({
    generatedAt: '2026-10-18T10:00:00.000Z',
    dispute: {
      id: 'd',
      processorId: 'stripe',
      processorDisputeId: 'dp_1',
      status: 'gathering',
      reasonCode: 'fraudulent',
      reasonCategory: 'fraud',
      amount: '100.0000',
      openedAt: 'x',
      dueAt: 'y',
    },
    invoice: {
      number: 'INV-1',
      status: 'paid',
      clientName: 'C',
      issueDate: 'a',
      dueDate: 'b',
      total: '100.0000',
      sentAt: 's',
      lines: [],
      snapshotHash: null,
      snapshotFileId: null,
    },
    receipt: {
      reference: 'PAY-1',
      paidAt: 'p',
      amount: '100',
      surcharge: '0',
      total: '100',
      refunded: '0',
      method: 'Card',
      processorName: 'Stripe',
      processorTransactionId: 'ch_1',
    },
    consent: {
      records: [
        {
          at: 'c',
          version: 'v1',
          text: 'I accept.',
          textHash: 'h',
          ipMasked: 'm',
          ip: '203.0.113.9',
          device: 'Chrome',
          userAgent: 'ua',
        },
      ],
      termsVersion: 'v1',
      refundWindowDays: 180,
      refundPolicyText: 'policy',
    },
    delivery: { invoiceMessages: [], acceptances: [] },
    communications: [],
    identity: {
      views: [],
      payerIp: '203.0.113.9',
      payerCountry: 'US',
      cardIdentity: 'A card fingerprint is stored (not shown)',
      threeDs: { authenticated: true },
    },
    timeline: [{ at: 't', source: 'invoice', text: 'sent' }],
    audit: { chainOk: true, checkedFrom: '', checkedTo: '', gaps: [], entries: [] },
    platform: { name: 'KD SOLUTION IT', companyName: 'Acme', note: 'n' },
  }) as EvidencePackData;

async function main(): Promise<void> {
  await check('CRC-32 matches the standard check value', () => {
    assert.equal(crc32(bytes('123456789')), 0xcbf43926);
    assert.equal(crc32(new Uint8Array()), 0);
  });

  await check('a ZIP is read back file by file, byte for byte', () => {
    const files = [
      { name: 'evidence-pack.pdf', bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0, 1, 2, 255]) },
      { name: 'data.json', bytes: bytes('{"a":1}\n') },
      { name: 'empty.txt', bytes: new Uint8Array() },
    ];
    const back = readZip(buildZip(files, new Date('2026-10-18T10:00:00Z')));
    assert.deepEqual(
      back.map((f) => f.name),
      files.map((f) => f.name),
    );
    back.forEach((f, i) => assert.deepEqual([...f.data], [...(files[i]?.bytes ?? [])]));
  });

  await check("python's own zip reader accepts the ZIP and its checksums", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-zip-'));
    const file = path.join(dir, 'pack.zip');
    fs.writeFileSync(
      file,
      buildZip([
        { name: 'a.txt', bytes: bytes('hello') },
        { name: 'b.json', bytes: bytes('{}') },
      ]),
    );
    const out = execFileSync(
      'python3',
      [
        '-I',
        '-c',
        'import sys, zipfile\nz = zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(",".join(sorted(z.namelist())), z.read("a.txt").decode())',
        file,
      ],
      { encoding: 'utf8' },
    );
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(out.trim(), 'a.txt,b.json hello');
  });

  await check('unsafe, repeated and too many file names are refused', () => {
    for (const name of [
      '../x.txt',
      '/etc/passwd',
      'a/b.txt',
      'a\\b.txt',
      '.hidden',
      '',
      'x'.repeat(101),
    ])
      assert.throws(() => buildZip([{ name, bytes: bytes('x') }]), name);
    assert.throws(
      () =>
        buildZip([
          { name: 'a.txt', bytes: bytes('1') },
          { name: 'a.txt', bytes: bytes('2') },
        ]),
      'duplicate',
    );
    assert.throws(() => buildZip([]), 'no files');
  });

  await check('the processor adapter gets the facts it needs and no card data', () => {
    const facts = processorSections(sample());
    assert.deepEqual(Object.keys(facts).sort(), [
      'consent',
      'delivery',
      'identity',
      'invoice',
      'receipt',
      'refundPolicy',
      'timeline',
    ]);
    const text = JSON.stringify(facts);
    assert.ok(text.includes('203.0.113.9') && text.includes('I accept.'));
    assert.ok(!/\b\d{13,19}\b/.test(text), 'no card-like number');
    assert.ok(!/fingerprint/i.test(text), 'no card identity');
  });

  await check('a pack is promised for at least eighteen months', () => {
    assert.ok(PACK_RETENTION_MONTHS >= 18);
  });

  process.stdout.write(`step13-evidence-packs: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
