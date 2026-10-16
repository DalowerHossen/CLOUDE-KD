// path: scripts/verify/step05-core.ts
// Logic checks of STEP 05 that need no database or network. Run: npx tsx scripts/verify/step05-core.ts
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { decryptBytes, encryptBytes, type RootKeys } from '@/lib/encryption/aead';
import { blindIndex, normalizeForIndex } from '@/lib/encryption/blind-index';
import { createDriveAdapter, type DriveAccess } from '@/lib/storage/adapters/google-drive';
import { createSupabaseAdapter } from '@/lib/storage/adapters/supabase';
import { ProviderUnavailableError, objectPath, withBackoff } from '@/lib/storage/adapters/base';
import { parseRange } from '@/lib/storage/range';
import { watermarkPdf } from '@/lib/storage/watermark';
import { PDFDocument } from 'pdf-lib';
import { createHttpScanner } from '@/lib/storage/scanner';
import { maskEmail, maskIdentifier, maskName, maskPhone } from '@/lib/encryption/redact';

let failures = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
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

async function main(): Promise<void> {
  const roots: RootKeys = { 1: randomBytes(32), 2: randomBytes(32) };
  const text = (b: Uint8Array): string => new TextDecoder().decode(b);

  await check('encryption: round trip, fresh iv, key version tag', () => {
    const msg = new TextEncoder().encode('secret value');
    const a = encryptBytes(roots, 1, 'pii', msg, 'user-1');
    const b = encryptBytes(roots, 1, 'pii', msg, 'user-1');
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.ciphertext, b.ciphertext);
    assert.equal(a.keyVersion, 1);
    assert.equal(text(decryptBytes(roots, 'pii', a, 'user-1')), 'secret value');
    const v2 = encryptBytes(roots, 2, 'pii', msg, 'user-1');
    assert.equal(v2.keyVersion, 2);
    assert.equal(text(decryptBytes(roots, 'pii', v2, 'user-1')), 'secret value');
    assert.equal(
      text(decryptBytes(roots, 'pii', a, 'user-1')),
      'secret value',
      'old version still reads',
    );
  });

  await check('encryption: tampering, wrong purpose, wrong scope and wrong key all fail', () => {
    const p = encryptBytes(roots, 1, 'kyc', new TextEncoder().encode('doc'), 'company-a');
    const flip = (s: string): string => (s.startsWith('A') ? `B${s.slice(1)}` : `A${s.slice(1)}`);
    assert.throws(() =>
      decryptBytes(roots, 'kyc', { ...p, ciphertext: flip(p.ciphertext) }, 'company-a'),
    );
    assert.throws(() => decryptBytes(roots, 'kyc', { ...p, tag: flip(p.tag) }, 'company-a'));
    assert.throws(() => decryptBytes(roots, 'kyc', { ...p, iv: flip(p.iv) }, 'company-a'));
    assert.throws(() => decryptBytes(roots, 'pii', p, 'company-a'), 'purpose is bound');
    assert.throws(() => decryptBytes(roots, 'kyc', p, 'company-b'), 'scope is bound');
    assert.throws(
      () => decryptBytes(roots, 'kyc', { ...p, keyVersion: 2 }, 'company-a'),
      'version is bound',
    );
    assert.throws(
      () => decryptBytes({ 1: randomBytes(32) }, 'kyc', p, 'company-a'),
      'other root key',
    );
    assert.throws(
      () => decryptBytes({ 1: roots[1] }, 'kyc', { ...p, keyVersion: 3 }, 'company-a'),
      'unknown version',
    );
  });

  await check('encryption: large and empty payloads', () => {
    const big = randomBytes(2_000_000);
    const p = encryptBytes(roots, 1, 'files', big, 'c');
    assert.ok(Buffer.from(decryptBytes(roots, 'files', p, 'c')).equals(big));
    const empty = encryptBytes(roots, 1, 'files', new Uint8Array(0), 'c');
    assert.equal(decryptBytes(roots, 'files', empty, 'c').length, 0);
  });

  await check('blind index: stable, normalized, keyed, field separated', () => {
    const a = blindIndex(roots, 1, 'tax_id', 'AB-123 45');
    assert.equal(a, blindIndex(roots, 1, 'tax_id', 'ab12345'));
    assert.notEqual(a, blindIndex(roots, 1, 'bank', 'ab12345'));
    assert.notEqual(a, blindIndex({ 1: randomBytes(32) }, 1, 'tax_id', 'ab12345'));
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(normalizeForIndex(' A-b C '), 'abc');
  });

  await check('redaction helpers', () => {
    assert.equal(maskEmail('jane@example.com'), 'j***@example.com');
    assert.equal(maskEmail('nope'), '***');
    assert.equal(maskPhone('+1 (555) 123-4567'), '***4567');
    assert.equal(maskIdentifier('123-45-6789'.replace(/-/g, '')), '*****6789');
    assert.equal(maskIdentifier('12'), '****');
    assert.equal(maskName('Jane Doe'), 'J*** D***');
  });
  await check(
    'malware scanner adapter: clean, infected, error and unreadable answers',
    async () => {
      const mode = { value: 'clean' };
      const server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const auth = req.headers.authorization;
          if (auth !== 'Bearer tok-12345') {
            res.statusCode = 401;
            res.end();
            return;
          }
          if (mode.value === 'error') {
            res.statusCode = 500;
            res.end();
          } else if (mode.value === 'garbage') {
            res.end('not json');
          } else if (mode.value === 'infected') {
            res.end(JSON.stringify({ infected: true, signature: 'Eicar-Test' }));
          } else {
            res.end(
              JSON.stringify({
                infected: false,
                signature: null,
                size: Buffer.concat(chunks).length,
              }),
            );
          }
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/scan`;
      try {
        const scanner = createHttpScanner(url, 'tok-12345', 3000);
        assert.deepEqual(await scanner.scan(Buffer.from('hello')), { status: 'clean' });
        mode.value = 'infected';
        assert.deepEqual(await scanner.scan(Buffer.from('x')), {
          status: 'infected',
          signature: 'Eicar-Test',
        });
        mode.value = 'error';
        assert.equal((await scanner.scan(Buffer.from('x'))).status, 'error');
        mode.value = 'garbage';
        assert.equal((await scanner.scan(Buffer.from('x'))).status, 'error');
        assert.equal(
          (await createHttpScanner(url, 'wrong-token', 3000).scan(Buffer.from('x'))).status,
          'error',
        );
        assert.equal(
          (
            await createHttpScanner('http://127.0.0.1:1/scan', undefined, 1000).scan(
              Buffer.from('x'),
            )
          ).status,
          'error',
        );
      } finally {
        server.close();
      }
    },
  );
  await check('adapters: object path, backoff, range header, watermark', async () => {
    assert.equal(objectPath('c1', 'invoice', 'f1'), 'tenants/c1/invoice/f1.kdenc');
    assert.equal(objectPath(null, 'export', 'f2'), 'tenants/platform/export/f2.kdenc');
    let calls = 0;
    const value = await withBackoff(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('busy');
        return 'done';
      },
      () => true,
      4,
      1,
    );
    assert.equal(value, 'done');
    assert.equal(calls, 3);
    calls = 0;
    await assert.rejects(
      withBackoff(
        async () => {
          calls += 1;
          throw new Error('final');
        },
        () => false,
        4,
        1,
      ),
    );
    assert.equal(calls, 1);
    assert.equal(parseRange(null, 100), null);
    assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9 });
    assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
    assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
    assert.deepEqual(parseRange('bytes=50-500', 100), { start: 50, end: 99 });
    assert.equal(parseRange('bytes=100-', 100), 'invalid');
    assert.equal(parseRange('bytes=9-1', 100), 'invalid');
    assert.equal(parseRange('items=1-2', 100), 'invalid');
    assert.equal(parseRange('bytes=-', 100), 'invalid');
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    const marked = await watermarkPdf(await doc.save(), 'KD SOLUTION IT | 0190aaaa | 2026-01-01');
    assert.equal((await PDFDocument.load(marked)).getPageCount(), 1);
    assert.ok(marked.length > 0);
  });

  await check('supabase adapter: encrypted object round trip against a fake client', async () => {
    const store = new Map<string, Buffer>();
    const buckets = new Set<string>();
    const fake = {
      storage: {
        createBucket: async (name: string) => {
          if (buckets.has(name)) return { error: { message: 'The resource already exists' } };
          buckets.add(name);
          return { error: null };
        },
        from: () => ({
          upload: async (path: string, body: Buffer, options: { upsert: boolean }) => {
            if (store.has(path) && !options.upsert) return { error: { message: 'exists' } };
            store.set(path, Buffer.from(body));
            return { error: null };
          },
          download: async (path: string) => {
            const found = store.get(path);
            return found
              ? { data: new Blob([new Uint8Array(found)]), error: null }
              : { data: null, error: { message: 'missing' } };
          },
          remove: async (paths: string[]) => {
            for (const p of paths) store.delete(p);
            return { error: null };
          },
          list: async () => ({ data: [], error: null }),
        }),
      },
    };
    const adapter = createSupabaseAdapter(() => fake as never, 'kd-files');
    const sealed = Buffer.from('ciphertext-bytes');
    const { ref } = await adapter.put({
      companyId: 'c1',
      category: 'invoice',
      fileId: 'f1',
      bytes: sealed,
    });
    assert.equal(ref, 'tenants/c1/invoice/f1.kdenc');
    assert.ok(Buffer.from(await adapter.get(ref, 'c1')).equals(sealed));
    assert.deepEqual(await adapter.health('c1'), { ok: true });
    await assert.rejects(
      adapter.put({ companyId: 'c1', category: 'invoice', fileId: 'f1', bytes: sealed }),
      ProviderUnavailableError,
    );
    await adapter.remove(ref, 'c1');
    await assert.rejects(adapter.get(ref, 'c1'), ProviderUnavailableError);
  });

  await check(
    'google drive adapter: folders, upload, download, rate-limit retry, revoked link',
    async () => {
      const files = new Map<
        string,
        { name: string; parents: string[]; mime: string; body: Buffer }
      >();
      const log: string[] = [];
      let ids = 0;
      let rateLimitOnce = true;
      let revoked = false;
      const server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks);
          const url = new URL(req.url ?? '/', 'http://x');
          log.push(`${req.method} ${url.pathname}`);
          const send = (status: number, json: unknown): void => {
            res.statusCode = status;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(json));
          };
          if (req.headers.authorization !== 'Bearer token-1') return send(401, {});
          if (revoked) return send(401, {});
          if (req.method === 'GET' && url.pathname === '/drive/v3/files') {
            const q = url.searchParams.get('q') ?? '';
            const name = /name='([^']*)'/.exec(q)?.[1];
            const parent = /'([^']*)' in parents/.exec(q)?.[1];
            const hit = [...files.entries()].find(
              ([, f]) =>
                f.name === name &&
                f.mime === 'application/vnd.google-apps.folder' &&
                f.parents.includes(parent === 'root' ? 'root' : String(parent)),
            );
            return send(200, { files: hit ? [{ id: hit[0] }] : [] });
          }
          if (req.method === 'POST' && url.pathname === '/drive/v3/files') {
            const meta = JSON.parse(body.toString()) as {
              name: string;
              mimeType: string;
              parents?: string[];
            };
            const id = `id${++ids}`;
            files.set(id, {
              name: meta.name,
              parents: meta.parents ?? ['root'],
              mime: meta.mimeType,
              body: Buffer.alloc(0),
            });
            return send(200, { id });
          }
          if (req.method === 'POST' && url.pathname === '/upload/drive/v3/files') {
            if (rateLimitOnce) {
              rateLimitOnce = false;
              return send(403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } });
            }
            const text = body.toString('latin1');
            const meta = JSON.parse(/\r\n\r\n(\{.*?\})\r\n--/s.exec(text)?.[1] ?? '{}') as {
              name: string;
              parents: string[];
            };
            const start = text.indexOf('application/octet-stream\r\n\r\n', text.indexOf('--', 5));
            const payloadStart = text.indexOf('\r\n\r\n', start) + 4;
            const payloadEnd = text.lastIndexOf('\r\n--');
            const id = `id${++ids}`;
            files.set(id, {
              name: meta.name,
              parents: meta.parents,
              mime: 'application/octet-stream',
              body: body.subarray(payloadStart, payloadEnd),
            });
            return send(200, { id });
          }
          const m = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
          if (m && req.method === 'GET') {
            const f = files.get(decodeURIComponent(m[1] ?? ''));
            if (!f) return send(404, {});
            res.setHeader('content-type', 'application/octet-stream');
            res.end(f.body);
            return;
          }
          if (m && req.method === 'DELETE') {
            const had = files.delete(decodeURIComponent(m[1] ?? ''));
            return send(had ? 204 : 404, {});
          }
          send(404, {});
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const redirectingFetch: typeof fetch = (input, init) =>
        fetch(String(input).replace('https://www.googleapis.com', base), init);
      const cache: Record<string, string> = {};
      let revokedMarked = false;
      const access: DriveAccess = {
        accessToken: async () => 'token-1',
        folderCache: async () => ({ ...cache }),
        saveFolder: async (_c, key, id) => {
          cache[key] = id;
        },
        markRevoked: async () => {
          revokedMarked = true;
        },
      };
      try {
        const adapter = createDriveAdapter(access, redirectingFetch);
        const sealed = Buffer.from([0, 1, 2, 3, 250, 251, 13, 10, 45, 45, 255]);
        const { ref } = await adapter.put({
          companyId: 'c1',
          category: 'invoice',
          fileId: 'f1',
          bytes: sealed,
        });
        assert.ok(Object.keys(cache).includes('tenants/c1/invoice'), 'folder path cached');
        assert.equal([...files.values()].filter((f) => f.mime.includes('folder')).length, 3);
        assert.ok(
          Buffer.from(await adapter.get(ref, 'c1')).equals(sealed),
          'bytes survive the round trip',
        );
        const second = await adapter.put({
          companyId: 'c1',
          category: 'invoice',
          fileId: 'f2',
          bytes: sealed,
        });
        assert.equal(
          [...files.values()].filter((f) => f.mime.includes('folder')).length,
          3,
          'folders are reused',
        );
        await adapter.remove(second.ref, 'c1');
        await adapter.remove(second.ref, 'c1');
        await assert.rejects(
          adapter.put({ companyId: null, category: 'export', fileId: 'f3', bytes: sealed }),
          ProviderUnavailableError,
        );
        assert.ok(
          log.filter((l) => l === 'POST /upload/drive/v3/files').length >= 3,
          'rate limited upload was retried',
        );
        revoked = true;
        await assert.rejects(adapter.get(ref, 'c1'), ProviderUnavailableError);
        assert.ok(revokedMarked, 'revoked link is recorded');
      } finally {
        server.close();
      }
    },
  );
}

main()
  .then(() => {
    if (failures > 0) process.exit(1);
    process.stdout.write('step05-core: ok\n');
  })
  .catch((error: unknown) => {
    process.stderr.write(`step05-core crashed: ${String(error)}\n`);
    process.exit(1);
  });
