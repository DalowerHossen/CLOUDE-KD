// path: scripts/verify/step16-gateway.ts
// Logic checks of the sub-merchant gateway (16.12) that need no database or network: path templates and what they must refuse,
// route choice, the query string, the address of the app, the inputs, keys and their address allow list, the signature and how the
// app checks it (also while a rotated secret overlaps), the headers in both directions and the mapping of the app's status.
// The tables are tested in sql/assertions/s16_019_gateway.sql. The forwarding service is tested with fakes below once added.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-gateway.ts
import assert from 'node:assert/strict';
import {
  checkUpstreamBase,
  cleanQuery,
  findRoute,
  gatewaySignature,
  ipAllowed,
  keyInput,
  makeGatewaySecret,
  makeSubKey,
  mapStatus,
  matchTemplate,
  parseAllowEntry,
  parseRequestPath,
  parseTemplate,
  passableType,
  responseHeadersOf,
  routeInput,
  subKeyFromHeader,
  subMerchantInput,
  subMerchantUpdate,
  upstreamHeaders,
  upstreamInput,
  upstreamUpdate,
  upstreamUrl,
  verifyGatewaySignature,
} from '@/lib/gateway/rules';

let checks = 0;
const check = async (name: string, fn: () => void | Promise<void>): Promise<void> => {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

async function main(): Promise<void> {
  await check('templates: literal and {name} segments only', () => {
    assert.ok(parseTemplate('/orders'));
    assert.ok(parseTemplate('/orders/{id}/items/{itemId}'));
    assert.deepEqual(parseTemplate('/'), []);
    for (const bad of [
      'orders',
      '/orders/*',
      '/orders/{Id}',
      '/orders/{id}/{id}',
      '/a/../b',
      '/a//b',
      '/a/./b',
      '/a b',
      '/a%2fb',
      '/{}',
      '/a/{id',
      `/${String.fromCharCode(0xe4)}`,
    ])
      assert.equal(parseTemplate(bad), null, bad);
  });

  await check('request paths: no dot segments, empty segments, encoding or odd characters', () => {
    assert.deepEqual(parseRequestPath('/orders/42'), ['orders', '42']);
    for (const bad of [
      '/orders/../x',
      '/orders/./x',
      '//orders',
      '/orders//x',
      '/orders/',
      '/orders/%2e%2e',
      '/orders/a%2fb',
      '/orders/a\\b',
      '/orders/a\u0000b',
      '/orders/a?b',
      'orders',
    ])
      assert.equal(parseRequestPath(bad), null, JSON.stringify(bad));
    assert.equal(parseRequestPath('/' + 'a/'.repeat(13) + 'a'), null);
  });

  await check('matching: same shape only, a placeholder holds one segment', () => {
    assert.ok(matchTemplate('/orders/{id}', '/orders/42'));
    assert.ok(!matchTemplate('/orders/{id}', '/orders'));
    assert.ok(!matchTemplate('/orders/{id}', '/orders/42/items'));
    assert.ok(!matchTemplate('/orders/{id}', '/customers/42'));
    assert.ok(!matchTemplate('/orders/{id}', '/orders/../admin'));
  });

  await check(
    'route choice: method must match, the most specific template wins, disabled routes are ignored',
    () => {
      const routes = [
        { id: 'a', method: 'GET', pathTemplate: '/orders/{id}', enabled: true },
        { id: 'b', method: 'GET', pathTemplate: '/orders/export', enabled: true },
        { id: 'c', method: 'POST', pathTemplate: '/orders/{id}', enabled: true },
        { id: 'd', method: 'GET', pathTemplate: '/reports/{id}', enabled: false },
      ];
      assert.equal(findRoute(routes, 'GET', '/orders/export')?.id, 'b');
      assert.equal(findRoute(routes, 'GET', '/orders/7')?.id, 'a');
      assert.equal(findRoute(routes, 'POST', '/orders/7')?.id, 'c');
      assert.equal(findRoute(routes, 'DELETE', '/orders/7'), null);
      assert.equal(findRoute(routes, 'GET', '/reports/1'), null);
    },
  );

  await check('query: rewritten in a fixed form, limited, control characters refused', () => {
    assert.equal(cleanQuery(''), '');
    assert.equal(cleanQuery('?a=1&b=two%20words'), 'a=1&b=two+words');
    assert.equal(cleanQuery('a=1#frag'), null);
    assert.equal(cleanQuery('a=%0a'), 'a=%0A');
    assert.equal(cleanQuery('a=1\nb=2'), null);
    assert.equal(cleanQuery(Array.from({ length: 31 }, (_, i) => `k${i}=1`).join('&')), null);
    assert.equal(cleanQuery('k=' + 'x'.repeat(400)), null);
  });

  await check(
    'app address: https host name, no query, not the platform, kept without a trailing slash',
    () => {
      const ok = checkUpstreamBase('https://app.example.com/api/', 'platform.example.org');
      assert.ok(ok.ok && ok.base === 'https://app.example.com/api');
      assert.ok(checkUpstreamBase('https://app.example.com', null).ok);
      for (const bad of [
        'http://app.example.com',
        'https://127.0.0.1',
        'https://localhost',
        'https://app.example.com/?x=1',
        'https://user:pw@app.example.com',
        'https://platform.example.org/api',
        'https://10.0.0.5/x',
      ])
        assert.equal(checkUpstreamBase(bad, 'platform.example.org').ok, false, bad);
      assert.equal(
        upstreamUrl('https://app.example.com/api', '/orders/7', 'a=1'),
        'https://app.example.com/api/orders/7?a=1',
      );
      assert.equal(upstreamUrl('https://app.example.com', '/', ''), 'https://app.example.com');
    },
  );

  await check('inputs are strict and bounded', () => {
    assert.ok(upstreamInput.safeParse({ baseUrl: 'https://app.example.com' }).success);
    assert.equal(
      upstreamInput.safeParse({ baseUrl: 'https://app.example.com', extra: 1 }).success,
      false,
    );
    assert.equal(upstreamUpdate.safeParse({ version: 1 }).success, false);
    assert.ok(
      routeInput.safeParse({ name: 'Orders', method: 'GET', pathTemplate: '/orders/{id}' }).success,
    );
    assert.equal(
      routeInput.safeParse({ name: 'Orders', method: 'TRACE', pathTemplate: '/orders' }).success,
      false,
    );
    assert.equal(
      routeInput.safeParse({ name: 'Orders', method: 'GET', pathTemplate: '/orders/*' }).success,
      false,
    );
    const sm = subMerchantInput.parse({ name: 'Shop', reference: 'shop-1' });
    assert.equal(sm.routeIds, null);
    assert.equal(
      subMerchantInput.safeParse({ name: 'Shop', reference: 'has space' }).success,
      false,
    );
    assert.equal(subMerchantUpdate.safeParse({ version: 2 }).success, false);
    assert.ok(subMerchantUpdate.safeParse({ version: 2, status: 'suspended' }).success);
    assert.equal(subMerchantInput.safeParse({ name: '<b>', reference: 'x' }).success, false);
  });

  await check('keys: format, hash, header reading', async () => {
    const key = await makeSubKey();
    assert.match(key.secret, /^kd_sub_[0-9A-Za-z]{32}$/);
    assert.equal(key.hash.length, 64);
    assert.equal(key.lastChars, key.secret.slice(-4));
    assert.equal(subKeyFromHeader(`Bearer ${key.secret}`), key.secret);
    assert.equal(subKeyFromHeader(`bearer ${key.secret}`), key.secret);
    assert.equal(subKeyFromHeader(key.secret), null);
    assert.equal(subKeyFromHeader('Bearer kd_live_' + 'a'.repeat(32)), null);
    assert.equal(subKeyFromHeader(null), null);
    const k2 = await makeSubKey();
    assert.notEqual(k2.secret, key.secret);
  });

  await check('key input: limits, allow list entries', () => {
    const k = keyInput.parse({ name: 'Main' });
    assert.equal(k.rateLimitPerMinute, 60);
    assert.equal(k.allowedIps, null);
    assert.equal(keyInput.safeParse({ name: 'Main', rateLimitPerMinute: 0 }).success, false);
    assert.equal(keyInput.safeParse({ name: 'Main', allowedIps: ['not an ip'] }).success, false);
    assert.ok(
      keyInput.safeParse({
        name: 'Main',
        allowedIps: ['203.0.113.7', '198.51.100.0/24', '2001:db8::1'],
      }).success,
    );
    assert.equal(keyInput.safeParse({ name: 'Main', allowedIps: ['10.0.0.0/4'] }).success, false);
  });

  await check('address allow list: exact, range, none means all', () => {
    assert.ok(ipAllowed('1.2.3.4', null));
    assert.ok(ipAllowed('1.2.3.4', []));
    assert.ok(ipAllowed('203.0.113.7', ['203.0.113.7']));
    assert.ok(!ipAllowed('203.0.113.8', ['203.0.113.7']));
    assert.ok(ipAllowed('198.51.100.200', ['198.51.100.0/24']));
    assert.ok(!ipAllowed('198.51.101.1', ['198.51.100.0/24']));
    assert.ok(ipAllowed('2001:db8::1', ['2001:DB8::1']));
    assert.ok(!ipAllowed('2001:db8::2', ['198.51.100.0/24']));
    assert.equal(parseAllowEntry('1.2.3.4/33'), null);
  });

  await check(
    'signature: the app can verify it, any change breaks it, a rotated secret overlaps',
    async () => {
      const secret = makeGatewaySecret();
      assert.match(secret, /^gwsec_[0-9A-Za-z]{40}$/);
      const old = makeGatewaySecret();
      const now = new Date('2026-10-24T10:00:00Z');
      const t = Math.floor(now.getTime() / 1000);
      const body = '{"amount":"12.5000"}';
      const header = await gatewaySignature([secret], t, 'post', '/orders?a=1', body);
      const base = { secret, header, method: 'POST', pathAndQuery: '/orders?a=1', body, now };
      assert.ok(await verifyGatewaySignature(base));
      assert.ok(!(await verifyGatewaySignature({ ...base, body: '{"amount":"99.0000"}' })));
      assert.ok(!(await verifyGatewaySignature({ ...base, method: 'PUT' })));
      assert.ok(!(await verifyGatewaySignature({ ...base, pathAndQuery: '/orders?a=2' })));
      assert.ok(!(await verifyGatewaySignature({ ...base, secret: old })));
      assert.ok(
        !(await verifyGatewaySignature({ ...base, now: new Date(now.getTime() + 10 * 60_000) })),
      );
      assert.ok(!(await verifyGatewaySignature({ ...base, header: 'garbage' })));
      const both = await gatewaySignature([secret, old], t, 'POST', '/orders?a=1', body);
      assert.ok(await verifyGatewaySignature({ ...base, header: both }));
      assert.ok(await verifyGatewaySignature({ ...base, header: both, secret: old }));
    },
  );

  await check('headers to the app: only the fixed set, the key never travels', () => {
    const h = upstreamHeaders({
      accept: 'application/json',
      idempotencyKey: 'abcdefghijklmnop1234',
      hasBody: true,
      timestampSeconds: 1,
      signature: 't=1,v1=ab',
      subMerchantReference: 'shop-1',
      subMerchantId: 'id-1',
      correlationId: 'c-1',
    });
    assert.deepEqual(Object.keys(h).sort(), [
      'accept',
      'content-type',
      'idempotency-key',
      'user-agent',
      'x-kd-correlation-id',
      'x-kd-signature',
      'x-kd-sub-merchant',
      'x-kd-sub-merchant-id',
      'x-kd-timestamp',
    ]);
    const bad = upstreamHeaders({
      accept: 'x\r\nSet-Cookie: a=1',
      idempotencyKey: 'short',
      hasBody: false,
      timestampSeconds: 1,
      signature: 's',
      subMerchantReference: 'r',
      subMerchantId: 'i',
      correlationId: 'c',
    });
    assert.equal(bad.accept, 'application/json');
    assert.equal(bad['idempotency-key'], undefined);
    assert.equal(bad['content-type'], undefined);
  });

  await check('headers back: only the type, retry and replay flags pass', () => {
    const out = responseHeadersOf({
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': 'a=1',
      'retry-after': '30',
      server: 'x',
      'idempotent-replayed': 'true',
      location: 'https://evil.example',
    });
    assert.deepEqual(Object.keys(out).sort(), [
      'content-type',
      'idempotent-replayed',
      'retry-after',
      'x-content-type-options',
    ]);
    assert.equal(passableType('text/html'), null);
    assert.equal(passableType('application/octet-stream'), null);
    assert.ok(passableType('Application/JSON'));
    assert.equal(responseHeadersOf({ 'retry-after': 'soon' })['retry-after'], undefined);
  });

  await check('status mapping: 2xx and 4xx pass, 3xx and 5xx become 502', () => {
    assert.deepEqual(mapStatus(201), { pass: true, status: 201, outcome: 'ok' });
    assert.deepEqual(mapStatus(404), { pass: true, status: 404, outcome: 'client_error' });
    assert.deepEqual(mapStatus(429), { pass: true, status: 429, outcome: 'client_error' });
    assert.deepEqual(mapStatus(302), { pass: false, status: 502, outcome: 'upstream_error' });
    assert.deepEqual(mapStatus(503), { pass: false, status: 502, outcome: 'upstream_error' });
  });

  process.stdout.write(`step16-gateway: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
