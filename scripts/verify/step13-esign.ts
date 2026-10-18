// path: scripts/verify/step13-esign.ts
// Logic checks of e-signature (13.6.b) that need no database or network: the seal (and what breaks it), the statement
// checksum, signature pictures (real images only, re-drawn as small PNG) and the strict signing requests.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-esign.ts
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizeSignatureImage } from '@/services/esign/images';
import { computeSeal, verifySeal, type SealParts } from '@/services/esign/seal';
import { declineBody, signBody } from '@/services/esign/schemas';
import { SIGNATURE_STATEMENT, statementHash } from '@/services/esign/statement';

const TOKEN = 'A'.repeat(22) + '.' + 'B'.repeat(22);
const H = 'a'.repeat(64);
const SECRET = 'x'.repeat(48);
let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve(fn()).then(
    () => void (checks += 1),
    (error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    },
  );

const parts: SealParts = {
  contractId: '0192f1c0-0000-7000-8000-000000000001',
  docHash: H,
  archiveHash: 'b'.repeat(64),
  signatures: ['c'.repeat(64), 'd'.repeat(64)],
};

async function png(width: number, height: number): Promise<string> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: '#223344' },
  })
    .png()
    .toBuffer();
  return buffer.toString('base64');
}

async function main(): Promise<void> {
  await check(
    'the seal verifies, and any change to the file or a signature breaks it',
    async () => {
      const seal = await computeSeal(SECRET, parts);
      assert.match(seal, /^[0-9a-f]{64}$/);
      assert.ok(await verifySeal(SECRET, parts, seal));
      assert.ok(
        !(await verifySeal(SECRET, { ...parts, archiveHash: 'e'.repeat(64) }, seal)),
        'file changed',
      );
      assert.ok(
        !(await verifySeal(SECRET, { ...parts, docHash: 'e'.repeat(64) }, seal)),
        'wording changed',
      );
      assert.ok(
        !(await verifySeal(SECRET, { ...parts, signatures: ['c'.repeat(64)] }, seal)),
        'signature removed',
      );
      assert.ok(
        !(await verifySeal(
          SECRET,
          { ...parts, signatures: ['d'.repeat(64), 'c'.repeat(64)] },
          seal,
        )),
        'order swapped',
      );
      assert.ok(!(await verifySeal('y'.repeat(48), parts, seal)), 'other key');
    },
  );

  await check('the statement checksum is stable and covers the text', async () => {
    assert.equal(await statementHash(), await statementHash());
    assert.match(await statementHash(), /^[0-9a-f]{64}$/);
    assert.ok(SIGNATURE_STATEMENT.length >= 20 && SIGNATURE_STATEMENT.length <= 2000);
  });

  await check('a real picture is accepted and re-drawn as a small PNG', async () => {
    const out = await normalizeSignatureImage(`data:image/png;base64,${await png(1500, 600)}`);
    assert.deepEqual([...out.bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    const meta = await sharp(Buffer.from(out.bytes)).metadata();
    assert.ok((meta.width ?? 0) <= 600 && (meta.height ?? 0) <= 200);
    assert.match(out.hash, /^[0-9a-f]{64}$/);
  });

  await check('fake, broken and oversized pictures are refused', async () => {
    const text = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.repeat(10)).toString(
      'base64',
    );
    await assert.rejects(normalizeSignatureImage(text), 'not an image');
    const fakePng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.alloc(300, 1),
    ]).toString('base64');
    await assert.rejects(normalizeSignatureImage(fakePng), 'png header with junk');
    await assert.rejects(normalizeSignatureImage('not base64 !!'), 'bad text');
    const big = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.alloc(600_000, 1),
    ]).toString('base64');
    await assert.rejects(normalizeSignatureImage(big), 'too large');
  });

  await check('the signing request is strict and ties the picture to the method', () => {
    const typed = {
      token: TOKEN,
      docHash: H,
      method: 'typed',
      typedName: 'Jane Doe',
      image: null,
      accepted: true,
    };
    assert.ok(signBody.safeParse(typed).success);
    assert.ok(!signBody.safeParse({ ...typed, extra: 1 }).success);
    assert.ok(!signBody.safeParse({ ...typed, accepted: false }).success, 'must accept');
    assert.ok(!signBody.safeParse({ ...typed, image: 'AAAA' }).success, 'typed with a picture');
    assert.ok(
      !signBody.safeParse({ ...typed, method: 'drawn' }).success,
      'drawn without a picture',
    );
    assert.ok(signBody.safeParse({ ...typed, method: 'drawn', image: 'AAAA' }).success);
    assert.ok(!signBody.safeParse({ ...typed, docHash: 'xyz' }).success, 'checksum format');
    assert.ok(!signBody.safeParse({ ...typed, typedName: '<b>' }).success, 'markup in the name');
    assert.ok(declineBody.safeParse({ token: TOKEN, reason: 'Wrong amount' }).success);
    assert.ok(!declineBody.safeParse({ token: TOKEN, reason: 'x' }).success);
  });

  process.stdout.write(`step13-esign: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
