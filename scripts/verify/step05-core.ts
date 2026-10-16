// path: scripts/verify/step05-core.ts
// Logic checks of STEP 05 that need no database or network. Run: npx tsx scripts/verify/step05-core.ts
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { decryptBytes, encryptBytes, type RootKeys } from '@/lib/encryption/aead';
import { blindIndex, normalizeForIndex } from '@/lib/encryption/blind-index';
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
