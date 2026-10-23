// path: scripts/verify/step13-payment-page.ts
// Logic checks of the invoice and payment pages (13.2) that need no database or network: the consent wording and its
// hash, the strict consent request, the payment page settings, and a scan that the pages and their components load no
// analytics or third-party script. Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-payment-page.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CLIENT_CONSENT_VERSION,
  PAYMENT_PAGE_TIMEOUT_MINUTES,
  PORTAL_PAY_LINK_HOURS,
} from '@/config/s13-portal';
import { REFUND_WINDOW_DAYS } from '@/config/payment-risk';
import { profileForPath } from '@/lib/security/csp';
import { sha256Hex } from '@/lib/utils/hash';
import { consentText } from '@/services/portal/consent-capture';
import { consentBody, portalTokenSchema } from '@/services/portal/schemas';

const TOKEN = 'A'.repeat(22) + '.' + 'B'.repeat(22);
let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve(fn()).then(
    () => void (checks += 1),
    (error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    },
  );

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

async function main(): Promise<void> {
  await check('consent wording names the refund window and is stable', async () => {
    const text = consentText();
    assert.ok(text.includes(String(REFUND_WINDOW_DAYS)), 'refund days in the text');
    assert.ok(/terms/i.test(text) && /refund/i.test(text));
    assert.equal(consentText(), text);
    assert.match(await sha256Hex(text), /^[0-9a-f]{64}$/);
    assert.match(CLIENT_CONSENT_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  });

  await check('consent request is strict and needs the box ticked', () => {
    assert.ok(consentBody.safeParse({ token: TOKEN, accepted: true }).success);
    for (const bad of [
      { token: TOKEN, accepted: false },
      { token: TOKEN },
      { token: TOKEN, accepted: 'true' },
      { token: TOKEN, accepted: true, extra: 1 },
      { token: 'nope', accepted: true },
    ])
      assert.ok(!consentBody.safeParse(bad).success, JSON.stringify(bad));
    assert.ok(portalTokenSchema.safeParse(TOKEN).success);
  });

  await check('payment page settings', () => {
    assert.equal(PAYMENT_PAGE_TIMEOUT_MINUTES, 15);
    assert.ok(PORTAL_PAY_LINK_HOURS >= 1 && PORTAL_PAY_LINK_HOURS <= 24);
    assert.equal(profileForPath('/pay/sometoken'), 'payment');
    assert.equal(profileForPath('/i/sometoken'), 'default');
  });

  await check('no analytics or third-party script in the portal', () => {
    const files = [
      ...walk('components/client'),
      ...walk('app/(client-portal)'),
      ...walk('services/portal'),
      ...walk('app/api/portal'),
    ].filter((f) => /\.(ts|tsx)$/.test(f));
    assert.ok(files.length > 10);
    const banned =
      /googletagmanager|google-analytics|gtag\(|fbq\(|facebook\.net|hotjar|segment\.com|mixpanel|amplitude|plausible|<script/i;
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      assert.ok(!banned.test(text), `${file} loads a tracker or a script tag`);
    }
  });

  await check('portal pages are never cached and never indexed', () => {
    const layout = fs.readFileSync('app/(client-portal)/layout.tsx', 'utf8');
    assert.ok(layout.includes("referrer: 'no-referrer'") && layout.includes('index: false'));
    for (const route of ['i', 'pay', 'e', 'r', 'hub', 'c']) {
      const page = fs.readFileSync(`app/(client-portal)/${route}/[token]/page.tsx`, 'utf8');
      assert.ok(page.includes("dynamic = 'force-dynamic'"), route);
    }
  });

  process.stdout.write(`step13-payment-page: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
