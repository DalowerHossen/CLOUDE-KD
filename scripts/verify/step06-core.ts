// path: scripts/verify/step06-core.ts
// Logic checks of STEP 06 that need no database or network. Run: npx tsx scripts/verify/step06-core.ts
import assert from 'node:assert/strict';
import {
  COOKIE_POLICY_VERSION,
  consentFromCookieString,
  parseConsent,
  serializeConsent,
} from '@/lib/analytics/consent';

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
  await check('consent cookie: round trip, version change asks again, junk is not a choice', () => {
    for (const analytics of [true, false]) {
      for (const marketing of [true, false]) {
        assert.deepEqual(parseConsent(serializeConsent({ analytics, marketing })), {
          analytics,
          marketing,
        });
      }
    }
    assert.equal(parseConsent('v1999-01.a1.m1'), null, 'an older policy version');
    for (const bad of [
      '',
      'a1.m1',
      `v${COOKIE_POLICY_VERSION}.a2.m0`,
      `v${COOKIE_POLICY_VERSION}.a1`,
      null,
      undefined,
    ])
      assert.equal(parseConsent(bad), null, String(bad));
    const header = `theme=dark; kd_consent=${serializeConsent({ analytics: true, marketing: false })}; other=1`;
    assert.deepEqual(consentFromCookieString(header), { analytics: true, marketing: false });
    assert.equal(consentFromCookieString('theme=dark'), null);
    assert.equal(consentFromCookieString('kd_consent_other=v1'), null);
  });
}

main()
  .then(() => {
    if (failures > 0) process.exit(1);
    process.stdout.write('step06-core: ok\n');
  })
  .catch((error: unknown) => {
    process.stderr.write(`step06-core crashed: ${String(error)}\n`);
    process.exit(1);
  });
