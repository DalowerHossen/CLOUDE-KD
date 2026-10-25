// path: scripts/verify/step16-embed.ts
// Checks of the embedded checkout rules: allowed origins, style options, frame messages, the frame-ancestors rule, the
// CSRF rule for payer routes and the colour conversion.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-embed.ts
import assert from 'node:assert/strict';
import { checkCsrf } from '@/lib/middleware/csrf';
import {
  EMBED_MESSAGE_SOURCE,
  embedMessage,
  embedPageQuery,
  hexToHslTokens,
  normalizeOrigin,
  originInput,
} from '@/lib/payment/embed-sdk/rules';
import { buildCsp, profileForPath } from '@/lib/security/csp';
import { securityHeaders } from '@/lib/security/headers';

let checks = 0;
const run = async (name: string, fn: () => Promise<void> | void): Promise<void> => {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const base = {
  method: 'POST',
  pathname: '/api/payment-links/checkout/abcdefghijklmnop/pay',
  referer: null,
  appOrigin: 'https://app.example',
  cookieToken: undefined,
  headerToken: null,
  secret: 's'.repeat(40),
} as const;

async function main(): Promise<void> {
  await run('only https origins (and a local test server) with no path are accepted', () => {
    assert.equal(normalizeOrigin('https://shop.example.com'), 'https://shop.example.com');
    assert.equal(
      normalizeOrigin('https://shop.example.com:8443/'),
      'https://shop.example.com:8443',
    );
    assert.equal(normalizeOrigin('http://localhost:3000'), 'http://localhost:3000');
    for (const bad of [
      'http://shop.example.com',
      'https://shop.example.com/checkout',
      'https://shop.example.com?x=1',
      'https://user:pw@shop.example.com',
      'https://*.example.com',
      'javascript:alert(1)',
      'shop.example.com',
      '',
    ])
      assert.equal(normalizeOrigin(bad), null, bad);
    assert.equal(originInput.safeParse({ origin: 'https://a.example' }).success, true);
    assert.equal(originInput.safeParse({ origin: 'https://a.example/x' }).success, false);
    assert.equal(originInput.safeParse({ origin: 'https://a.example', extra: 1 }).success, false);
  });
  await run('style options are limited before they reach a style attribute', () => {
    const q = (o: Record<string, unknown>): boolean =>
      embedPageQuery.safeParse({ origin: 'https://a.example', ...o }).success;
    assert.equal(q({ primary: '#1a2b3c', radius: '12', font: 'Inter, Arial' }), true);
    assert.equal(q({ primary: 'red' }), false);
    assert.equal(q({ primary: '#1a2b3c;background:url(x)' }), false);
    assert.equal(q({ radius: '99' }), false);
    assert.equal(q({ font: 'x;}body{display:none' }), false);
    assert.equal(q({ other: '1' }), false);
  });
  await run('frame messages are checked: shape, size and https redirect only', () => {
    const ok = (m: unknown): boolean => embedMessage.safeParse(m).success;
    const s = EMBED_MESSAGE_SOURCE;
    assert.equal(ok({ source: s, type: 'ready' }), true);
    assert.equal(ok({ source: s, type: 'resize', height: 480 }), true);
    assert.equal(ok({ source: s, type: 'resize', height: 99999 }), false);
    assert.equal(ok({ source: s, type: 'complete', paymentId: id, status: 'captured' }), true);
    assert.equal(ok({ source: s, type: 'complete', paymentId: 'x', status: 'captured' }), false);
    assert.equal(ok({ source: s, type: 'redirect', url: 'https://acs.example/3ds' }), true);
    assert.equal(ok({ source: s, type: 'redirect', url: 'http://acs.example' }), false);
    assert.equal(ok({ source: s, type: 'redirect', url: 'javascript:alert(1)' }), false);
    assert.equal(ok({ source: 'other', type: 'ready' }), false);
  });
  await run('the embed page may be framed only by the listed sites', () => {
    assert.equal(profileForPath('/embed/abcdefghijklmnop'), 'payment');
    const framed = buildCsp({
      nonce: 'n',
      production: true,
      profile: 'payment',
      frameAncestors: ['https://shop.example.com'],
    });
    assert.ok(framed.includes('frame-ancestors https://shop.example.com'));
    const closed = buildCsp({
      nonce: 'n',
      production: true,
      profile: 'payment',
      frameAncestors: [],
    });
    assert.ok(closed.includes("frame-ancestors 'none'"));
    const hostile = buildCsp({
      nonce: 'n',
      production: true,
      frameAncestors: ['https://a.example; script-src *', 'https://ok.example'],
    });
    assert.ok(hostile.includes('frame-ancestors https://ok.example;'));
    assert.equal(hostile.includes('script-src *'), false);
    const h = (allow: boolean): Record<string, string> =>
      securityHeaders({
        csp: 'x',
        trustedTypesReportOnly: 'y',
        production: true,
        allowFraming: allow,
      });
    assert.equal(h(false)['x-frame-options'], 'DENY');
    assert.equal(h(true)['x-frame-options'], undefined);
  });
  await run(
    'payer routes need the same origin but no cookie; other routes still need the cookie',
    async () => {
      assert.equal(await checkCsrf({ ...base, origin: 'https://app.example' }), 'ok');
      assert.equal(await checkCsrf({ ...base, origin: 'https://evil.example' }), 'bad_origin');
      assert.equal(await checkCsrf({ ...base, origin: null }), 'bad_origin');
      assert.equal(
        await checkCsrf({ ...base, pathname: '/api/payments', origin: 'https://app.example' }),
        'missing_token',
      );
    },
  );
  await run('the colour tokens match the style system and keep the text readable', () => {
    assert.equal(hexToHslTokens('#ffffff').primary, '0 0% 100%');
    assert.equal(hexToHslTokens('#000000').primary, '0 0% 0%');
    assert.equal(hexToHslTokens('#0000ff').primary, '240 100% 50%');
    assert.equal(hexToHslTokens('#ffeb3b').foreground, '222 47% 11%');
    assert.equal(hexToHslTokens('#1a237e').foreground, '0 0% 100%');
  });
  process.stdout.write(`step16-embed: ${checks} checks passed\n`);
}
void main();
