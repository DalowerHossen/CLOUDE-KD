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
import { createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { createHttpAdapter } from '@/lib/email/adapters/http';
import { mapSmtpError } from '@/lib/email/adapters/smtp';
import {
  addTracking,
  collectLinks,
  disallowedLinkHosts,
  htmlToText,
  scanContent,
} from '@/lib/email/content';
import { parseMailgun, parsePostmark, parseResend, parseSendgrid } from '@/lib/email/inbound';
import { SMTP_PRESETS, presetById } from '@/lib/email/presets';
import { PermanentEmailError, TemporaryEmailError, type OutgoingMessage } from '@/lib/email/types';
import { render } from '@react-email/render';
import { createElement, type ComponentType } from 'react';
import { emailCatalog } from '@/emails/catalog';
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
  const message: OutgoingMessage = {
    from: { email: 'billing@example.com', name: 'Acme "Billing"' },
    to: 'jane@example.com',
    replyTo: 'help@example.com',
    subject: 'Invoice',
    html: '<p>Hi</p>',
    text: 'Hi',
    headers: { 'Auto-Submitted': 'auto-generated' },
  };

  await check('http mail adapters: request shape and error mapping', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const reply = (
      status: number,
      body: unknown,
      headers: Record<string, string> = {},
    ): typeof fetch =>
      (async (url: string | URL | Request, init?: RequestInit) => {
        seen.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify(body), { status, headers });
      }) as typeof fetch;
    const resend = createHttpAdapter('resend', {}, 're_key', reply(200, { id: 'r-1' }));
    assert.equal((await resend.send(message)).providerMessageId, 'r-1');
    const sent = JSON.parse(String(seen[0]?.init.body)) as Record<string, unknown>;
    assert.equal(seen[0]?.url, 'https://api.resend.com/emails');
    assert.equal(sent.from, '"Acme  Billing " <billing@example.com>');
    assert.deepEqual(sent.to, ['jane@example.com']);
    assert.equal(sent.reply_to, 'help@example.com');
    assert.equal((seen[0]?.init.headers as Record<string, string>).authorization, 'Bearer re_key');
    const grid = createHttpAdapter(
      'sendgrid',
      {},
      'SG.x',
      reply(202, '', { 'x-message-id': 'sg-1' }),
    );
    assert.equal((await grid.send(message)).providerMessageId, 'sg-1');
    assert.equal(seen[1]?.url, 'https://api.sendgrid.com/v3/mail/send');
    const gun = createHttpAdapter(
      'mailgun',
      { domain: 'mg.example.com', eu: true },
      'key-1',
      reply(200, { id: '<m-1@mg>' }),
    );
    assert.equal((await gun.send(message)).providerMessageId, '<m-1@mg>');
    assert.equal(seen[2]?.url, 'https://api.eu.mailgun.net/v3/mg.example.com/messages');
    assert.match(
      String((seen[2]?.init.headers as Record<string, string>).authorization),
      /^Basic /,
    );
    await assert.rejects(
      createHttpAdapter('mailgun', {}, 'k', reply(200, {})).send(message),
      PermanentEmailError,
    );
    const pm = createHttpAdapter('postmark', {}, 'tok', reply(200, { MessageID: 'pm-1' }));
    assert.equal((await pm.send(message)).providerMessageId, 'pm-1');
    assert.equal(
      (seen[3]?.init.headers as Record<string, string>)['x-postmark-server-token'],
      'tok',
    );
    await assert.rejects(
      createHttpAdapter('resend', {}, 'k', reply(429, {})).send(message),
      TemporaryEmailError,
    );
    await assert.rejects(
      createHttpAdapter('resend', {}, 'k', reply(503, {})).send(message),
      TemporaryEmailError,
    );
    await assert.rejects(
      createHttpAdapter('resend', {}, 'k', reply(401, {})).send(message),
      (e: unknown) => e instanceof PermanentEmailError && e.scope === 'config',
    );
    await assert.rejects(
      createHttpAdapter('resend', {}, 'k', reply(422, {})).send(message),
      (e: unknown) => e instanceof PermanentEmailError && e.scope === 'message',
    );
    const down = createHttpAdapter('resend', {}, 'k', (async () => {
      throw new Error('offline');
    }) as typeof fetch);
    await assert.rejects(down.send(message), TemporaryEmailError);
    assert.ok(mapSmtpError({ code: 'EAUTH' }) instanceof PermanentEmailError);
    assert.ok((mapSmtpError({ responseCode: 550 }) as PermanentEmailError).scope === 'message');
    assert.ok(mapSmtpError({ responseCode: 451 }) instanceof TemporaryEmailError);
    assert.ok(mapSmtpError({ code: 'ETIMEDOUT' }) instanceof TemporaryEmailError);
    assert.equal(presetById('ses')?.host('eu-west-1'), 'email-smtp.eu-west-1.amazonaws.com');
    assert.ok(
      SMTP_PRESETS.length >= 13 &&
        new Set(SMTP_PRESETS.map((p) => p.id)).size === SMTP_PRESETS.length,
    );
  });

  await check(
    'mail content: text part, tracking rewrite, link allow list, phishing signals',
    () => {
      const html =
        '<html><body><p>Pay <a href="https://app.example.com/pay/1?a=1&amp;b=2">here</a> or <a href="mailto:x@y.z">mail</a></p></body></html>';
      assert.match(htmlToText(html), /here \(https:\/\/app\.example\.com\/pay\/1\?a=1&b=2\)/);
      const t = addTracking(html, 'tok123456789012345', 'https://app.example.com/');
      assert.deepEqual(t.links, ['https://app.example.com/pay/1?a=1&b=2']);
      assert.ok(t.html.includes('/api/email/track/click/tok123456789012345/0'));
      assert.ok(t.html.includes('/api/email/track/open/tok123456789012345'));
      assert.ok(t.html.includes('mailto:x@y.z'), 'mailto links stay');
      assert.ok(
        !t.html.includes('app.example.com/pay'),
        'the real address is not in the tracked mail',
      );
      assert.deepEqual(collectLinks(html), ['https://app.example.com/pay/1?a=1&b=2']);
      assert.deepEqual(disallowedLinkHosts(html, ['example.com']), []);
      assert.deepEqual(
        disallowedLinkHosts('<a href="https://evil.test/x">x</a>', ['example.com']),
        ['evil.test'],
      );
      assert.deepEqual(
        disallowedLinkHosts('<a href="https://notexample.com/x">x</a>', ['example.com']),
        ['notexample.com'],
      );
      const bad = scanContent(
        '<form></form><script></script><a href="https://evil.test/login">https://bank.com/login</a><a href="http://1.2.3.4/x">x</a><a href="https://bit.ly/abc">y</a>You have won!',
      );
      const codes = bad.map((f) => f.code);
      for (const c of [
        'form',
        'script',
        'link_text_mismatch',
        'ip_address_link',
        'url_shortener',
        'spam_phrase',
      ] as const)
        assert.ok(codes.includes(c), c);
      assert.deepEqual(
        scanContent(
          '<p>Your invoice <a href="https://app.example.com/i/1">https://app.example.com/i/1</a></p>',
        ),
        [],
      );
    },
  );

  await check('provider feedback: signatures are checked before the body is read', () => {
    const now = Date.now();
    const ts = String(Math.floor(now / 1000));
    // Resend (Svix)
    const secret = `whsec_${Buffer.from('s3cret-key-bytes').toString('base64')}`;
    const body = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'r-1', bounce: { type: 'Permanent' } },
    });
    const good = createHmac('sha256', Buffer.from('s3cret-key-bytes'))
      .update(`msg_1.${ts}.${body}`)
      .digest('base64');
    const h = (sig: string, stamp = ts): Headers =>
      new Headers({ 'svix-id': 'msg_1', 'svix-timestamp': stamp, 'svix-signature': `v1,${sig}` });
    assert.deepEqual(parseResend(h(good), body, secret, now), {
      ok: true,
      events: [{ kind: 'bounce_hard', providerMessageId: 'r-1' }],
    });
    assert.equal(parseResend(h('AAAA'), body, secret, now).ok, false);
    assert.equal(parseResend(h(good), body + ' ', secret, now).ok, false);
    assert.equal(
      parseResend(h(good, String(Math.floor(now / 1000) - 3600)), body, secret, now).ok,
      false,
    );
    // Mailgun
    const token = 'tok-abc';
    const mg = (sigKey: string, event: object): string =>
      JSON.stringify({
        signature: {
          timestamp: ts,
          token,
          signature: createHmac('sha256', sigKey).update(`${ts}${token}`).digest('hex'),
        },
        'event-data': event,
      });
    const failed = mg('sign-key', {
      event: 'failed',
      severity: 'permanent',
      message: { headers: { 'message-id': '<m-1@mg>' } },
    });
    assert.deepEqual(parseMailgun(failed, 'sign-key', now), {
      ok: true,
      events: [{ kind: 'bounce_hard', providerMessageId: 'm-1@mg' }],
    });
    assert.equal(parseMailgun(failed, 'other-key', now).ok, false);
    assert.deepEqual(
      parseMailgun(
        mg('sign-key', {
          event: 'failed',
          severity: 'temporary',
          message: { headers: { 'message-id': 'a' } },
        }),
        'sign-key',
        now,
      ),
      { ok: true, events: [{ kind: 'bounce_soft', providerMessageId: 'a' }] },
    );
    // Postmark
    const pmBody = JSON.stringify({ RecordType: 'SpamComplaint', MessageID: 'pm-1' });
    const auth = `Basic ${Buffer.from('hook:pw').toString('base64')}`;
    assert.deepEqual(parsePostmark(auth, pmBody, 'hook', 'pw'), {
      ok: true,
      events: [{ kind: 'complaint', providerMessageId: 'pm-1' }],
    });
    assert.equal(parsePostmark('Basic nope', pmBody, 'hook', 'pw').ok, false);
    assert.equal(parsePostmark(null, pmBody, 'hook', 'pw').ok, false);
    // SendGrid (ECDSA P-256)
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pub = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const sgBody = JSON.stringify([
      { event: 'bounce', type: 'blocked', sg_message_id: 'sg-1.filter0' },
      { event: 'open', sg_message_id: 'sg-2.f' },
      { event: 'processed', sg_message_id: 'x' },
    ]);
    const sig = sign('sha256', Buffer.from(`${ts}${sgBody}`), privateKey).toString('base64');
    const sh = (sg: string): Headers =>
      new Headers({
        'x-twilio-email-event-webhook-signature': sg,
        'x-twilio-email-event-webhook-timestamp': ts,
      });
    assert.deepEqual(parseSendgrid(sh(sig), sgBody, pub, now), {
      ok: true,
      events: [
        { kind: 'bounce_soft', providerMessageId: 'sg-1' },
        { kind: 'opened', providerMessageId: 'sg-2' },
      ],
    });
    assert.equal(parseSendgrid(sh(sig), sgBody.replace('bounce', 'delivered'), pub, now).ok, false);
    assert.equal(
      parseSendgrid(sh(sig), sgBody, Buffer.from('junk').toString('base64'), now).ok,
      false,
    );
  });
  await check('every catalogue template renders with its variables', async () => {
    assert.ok(emailCatalog.length >= 8);
    assert.equal(
      new Set(emailCatalog.map((t) => t.definition.id)).size,
      emailCatalog.length,
      'ids are unique',
    );
    for (const t of emailCatalog) {
      const data: Record<string, unknown> = {};
      for (const v of t.definition.variables)
        data[v] = v.toLowerCase().includes('until') ? '2026-01-01' : `value-${v}`;
      const html = await render(
        createElement(t.component as ComponentType<Record<string, unknown>>, data),
      );
      assert.ok(html.includes('<html'), t.definition.id);
      assert.ok(!/<script/i.test(html), `${t.definition.id} has a script`);
    }
  });
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
