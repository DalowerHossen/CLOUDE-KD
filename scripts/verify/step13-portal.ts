// path: scripts/verify/step13-portal.ts
// Logic checks of the portal foundation (13.1) that need no database or network: request shapes, device labels, the code
// cookie, and every state of the one door (resolvePortalAccess) with fake security and tokens services.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-portal.ts
import assert from 'node:assert/strict';
import { registerService, unregisterService } from '@/lib/container';
import { describeDevice } from '@/services/portal/device';
import { otpVerifyBody, portalTokenSchema, tokenOnlyBody } from '@/services/portal/schemas';
import { PORTAL_ROUTES, resolvePortalAccess } from '@/services/portal/access';
import {
  OTP_SESSION_SECONDS,
  checkOtpCookieValue,
  makeOtpCookieValue,
} from '@/services/portal/otp-session';
import type { SecurityService, TokenService, TokenVerification } from '@/types/contracts';

const SECRET = 'x'.repeat(64);
const TOKEN = 'A'.repeat(22) + '.' + 'B'.repeat(22);
const ID = '0190b8f2-0000-7000-8000-000000000001';
const COMPANY = '0190b8f2-0000-7000-8000-000000000002';
const DOC = '0190b8f2-0000-7000-8000-000000000003';

let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve(fn()).then(
    () => void (checks += 1),
    (error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    },
  );

let denied = false;
let answer: TokenVerification = { valid: false, reason: 'invalid' };
const hits: string[] = [];
function installFakes(): void {
  unregisterService('security');
  unregisterService('tokens');
  registerService('security', {
    rateLimit: async (key: string) => {
      hits.push(key);
      return { allowed: !denied, remaining: 1, retryAfterSeconds: 10 };
    },
  } as unknown as SecurityService);
  registerService('tokens', { verify: async () => answer } as unknown as TokenService);
}
const valid = (
  over: Partial<Extract<TokenVerification, { valid: true }>> = {},
): TokenVerification => ({
  valid: true,
  id: ID,
  docType: 'invoice',
  docId: DOC,
  companyId: COMPANY,
  otpRequired: false,
  ...over,
});

async function main(): Promise<void> {
  await check('request shapes are strict', () => {
    assert.ok(portalTokenSchema.safeParse(TOKEN).success);
    for (const bad of [
      '',
      'abc',
      TOKEN + 'x',
      'A'.repeat(22) + '.' + 'B'.repeat(21),
      TOKEN.replaceAll('.', '/'),
      `${TOKEN}\n`,
    ])
      assert.ok(!portalTokenSchema.safeParse(bad).success, bad);
    assert.ok(tokenOnlyBody.safeParse({ token: TOKEN }).success);
    assert.ok(!tokenOnlyBody.safeParse({ token: TOKEN, extra: 1 }).success);
    assert.ok(otpVerifyBody.safeParse({ token: TOKEN, code: '012345' }).success);
    for (const code of ['12345', '1234567', 'abcdef', '12 345'])
      assert.ok(!otpVerifyBody.safeParse({ token: TOKEN, code }).success, code);
  });

  await check('device label', () => {
    assert.equal(describeDevice(null), null);
    assert.equal(
      describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36'),
      'Chrome on Windows',
    );
    assert.equal(
      describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1'),
      'Safari on iOS',
    );
    assert.equal(
      describeDevice('Mozilla/5.0 (Windows NT 10.0) Edg/120.0 Chrome/120 Safari/537'),
      'Edge on Windows',
    );
    assert.equal(describeDevice('curl/8.0'), 'Unknown device');
  });

  await check('routes map to document types', () => {
    assert.deepEqual(PORTAL_ROUTES, {
      i: 'invoice',
      pay: 'payment',
      e: 'estimate',
      r: 'receipt',
      hub: 'hub',
      c: 'contract',
    });
  });

  await check('code cookie is bound to the link and expires', async () => {
    const now = 1_800_000_000;
    const value = await makeOtpCookieValue(SECRET, ID, now);
    assert.equal(await checkOtpCookieValue(SECRET, ID, value, now + 10), true);
    assert.equal(
      await checkOtpCookieValue(SECRET, '0190b8f2-0000-7000-8000-0000000000ff', value, now + 10),
      false,
    );
    assert.equal(
      await checkOtpCookieValue(SECRET, ID, value, now + OTP_SESSION_SECONDS + 1),
      false,
    );
    const [expires = '', signature = ''] = value.split('.');
    assert.equal(
      await checkOtpCookieValue(SECRET, ID, `${+expires + 3600}.${signature}`, now),
      false,
    );
    for (const bad of [
      undefined,
      '',
      'x',
      '1.2',
      `${expires}.${'0'.repeat(64)}`,
      `abc.${signature}`,
    ])
      assert.equal(await checkOtpCookieValue(SECRET, ID, bad, now), false, String(bad));
  });

  installFakes();

  await check('every state of the one door', async () => {
    answer = valid();
    const ok = await resolvePortalAccess(TOKEN, ['invoice']);
    assert.equal(ok.state, 'ok');
    assert.ok(
      ok.state === 'ok' && ok.tokenId === ID && ok.companyId === COMPANY && ok.docId === DOC,
    );
    // a link of another document type looks like an unknown link
    assert.deepEqual(await resolvePortalAccess(TOKEN, ['estimate']), { state: 'invalid' });
    answer = valid({ docType: 'estimate' });
    assert.deepEqual(await resolvePortalAccess(TOKEN, ['invoice']), { state: 'invalid' });
    for (const reason of ['invalid', 'expired', 'revoked'] as const) {
      answer = { valid: false, reason };
      assert.deepEqual(await resolvePortalAccess(TOKEN, ['invoice']), { state: reason });
    }
    // a code is required and no cookie exists outside a request: closed
    answer = valid({ otpRequired: true });
    const gate = await resolvePortalAccess(TOKEN, ['invoice']);
    assert.equal(gate.state, 'otp');
  });

  await check('requests are limited per address and per link', async () => {
    hits.length = 0;
    answer = valid();
    await resolvePortalAccess(TOKEN, ['invoice']);
    assert.ok(hits.some((k) => k.startsWith('portal:ip:')));
    assert.ok(hits.some((k) => k.startsWith('portal:token:')));
    assert.ok(!hits.some((k) => k.includes(TOKEN)), 'the link never appears in a limiter key');
    denied = true;
    assert.deepEqual(await resolvePortalAccess(TOKEN, ['invoice']), { state: 'limited' });
    denied = false;
  });

  process.stdout.write(`step13-portal: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
