// path: scripts/verify/step03-core.ts
// Verification of STEP 03 pure logic (no database, no network). Run: npx tsx scripts/verify/step03-core.ts
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkPassword, passwordStrength } from '@/lib/auth/password';
import {
  breachCount,
  hashPasswordForHistory,
  isPasswordReused,
  matchesHistoryHash,
} from '@/services/auth/password-hash';
import { identifierHash, normalizeIdentifier } from '@/lib/auth/lock';
import {
  buildOtpAuthUri,
  currentTotp,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  looksLikeBackupCode,
  normalizeBackupCode,
  verifyTotp,
} from '@/lib/auth/two-factor';
import { isDisposableEmail } from '@/services/auth/disposable-emails';

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
  await check('password policy: 12+ characters with upper, lower, digit, special', () => {
    assert.equal(checkPassword('Abcdefghij1!').ok, true);
    assert.deepEqual(checkPassword('Short1!').failed, ['minLength']);
    assert.deepEqual(checkPassword('alllowercase1!').failed, ['upper']);
    assert.deepEqual(checkPassword('ALLUPPERCASE1!').failed, ['lower']);
    assert.deepEqual(checkPassword('NoDigitsHere!!').failed, ['digit']);
    assert.deepEqual(checkPassword('NoSpecialChars12').failed, ['special']);
    assert.ok(
      checkPassword('Johnsmith123!x', 'johnsmith@example.com').failed.includes('containsEmail'),
    );
    assert.ok(checkPassword('A1!'.repeat(50)).failed.includes('maxLength'));
  });

  await check('password strength indicator', () => {
    assert.equal(passwordStrength(''), 0);
    assert.ok(passwordStrength('Xylophone7!Tzq') >= 2);
    assert.equal(passwordStrength('aaaaaaaaaaaa'), 0);
    assert.equal(passwordStrength('Xk9#mQ2$vL7!pR4&wZ'), 4);
  });

  await check('password history hashes: verify, reject, unique salts', async () => {
    const a = await hashPasswordForHistory('Correct-Horse-9!');
    const b = await hashPasswordForHistory('Correct-Horse-9!');
    assert.notEqual(a, b);
    assert.equal(await matchesHistoryHash('Correct-Horse-9!', a), true);
    assert.equal(await matchesHistoryHash('Correct-Horse-8!', a), false);
    assert.equal(await isPasswordReused('Correct-Horse-9!', ['bad', a]), true);
    assert.equal(await isPasswordReused('Other-Horse-9!', [a, b]), false);
    assert.equal(await matchesHistoryHash('x', 'not$a$hash'), false);
  });

  await check('breach check sends only a 5 character prefix and reads the count', async () => {
    const sha1 = createHash('sha1').update('Password123!').digest('hex').toUpperCase();
    let requested = '';
    const count = await breachCount('Password123!', async (url) => {
      requested = url;
      return {
        ok: true,
        text: async () => `0000000000000000000000000000000000A:3\n${sha1.slice(5)}:42\n`,
      };
    });
    assert.equal(count, 42);
    assert.equal(requested, `https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
    assert.equal(requested.includes(sha1.slice(5)), false);
    assert.equal(
      await breachCount('Unseen-Pass-77!', async () => ({
        ok: true,
        text: async () => 'ABCDE:1\n',
      })),
      0,
    );
    assert.equal(
      await breachCount('x', async () => {
        throw new Error('offline');
      }),
      null,
    );
    assert.equal(await breachCount('x', async () => ({ ok: false, text: async () => '' })), null);
  });

  await check('disposable e-mail domains are refused, subdomains included', () => {
    assert.equal(isDisposableEmail('a@mailinator.com'), true);
    assert.equal(isDisposableEmail('a@sub.mailinator.com'), true);
    assert.equal(isDisposableEmail('A@YOPMAIL.COM'), true);
    assert.equal(isDisposableEmail('a@example.com'), false);
    assert.equal(isDisposableEmail('a@notmailinator.com'), false);
    assert.equal(isDisposableEmail('invalid'), false);
  });

  await check('lock identifier: one counter per normalized address, keyed hash', async () => {
    const key = 'k'.repeat(48);
    assert.equal(normalizeIdentifier('  User@Example.COM '), 'user@example.com');
    const a = await identifierHash('User@Example.com', key);
    assert.equal(a, await identifierHash(' user@example.com', key));
    assert.notEqual(a, await identifierHash('other@example.com', key));
    assert.notEqual(a, await identifierHash('user@example.com', 'z'.repeat(48)));
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  await check('totp: accepts the current code once, rejects replay and garbage', () => {
    const secret = generateTotpSecret();
    const code = currentTotp(secret);
    const first = verifyTotp(secret, code, 0);
    assert.equal(first.ok, true);
    assert.ok(first.step !== null && first.step > 0);
    assert.equal(verifyTotp(secret, code, first.step ?? 0).ok, false);
    assert.equal(verifyTotp(secret, '12345', 0).ok, false);
    assert.equal(verifyTotp(secret, 'abcdef', 0).ok, false);
    assert.equal(verifyTotp(generateTotpSecret(), code, 0).ok, false);
    assert.ok(buildOtpAuthUri('a@example.com', secret).startsWith('otpauth://totp/'));
  });

  await check('backup codes: ten unique, no look-alike characters, keyed hashes', async () => {
    const codes = generateBackupCodes();
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    for (const c of codes) {
      assert.match(c, /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
      assert.equal(looksLikeBackupCode(c), true);
    }
    assert.equal(looksLikeBackupCode('123456'), false);
    assert.equal(normalizeBackupCode(' ab12c-de34f '), 'AB12CDE34F');
    const key = 'k'.repeat(48);
    const code = codes[0] ?? '';
    assert.equal(
      await hashBackupCode(code, key),
      await hashBackupCode(code.toLowerCase().replace('-', ' '), key),
    );
    assert.notEqual(await hashBackupCode(code, key), await hashBackupCode(codes[1] ?? '', key));
    assert.notEqual(await hashBackupCode(code, key), await hashBackupCode(code, 'z'.repeat(48)));
  });
}

main()
  .then(() => {
    if (failures > 0) process.exit(1);
    process.stdout.write('step03-core: ok\n');
  })
  .catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  });
