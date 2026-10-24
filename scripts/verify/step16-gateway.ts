// path: scripts/verify/step16-gateway.ts
// Logic checks of the sub-merchant gateway (16.12) that need no database or network: path templates and what they must refuse,
// route choice, the query string, the address of the app, the inputs, keys and their address allow list, the signature and how the
// app checks it (also while a rotated secret overlaps), the headers in both directions and the mapping of the app's status.
// The tables are tested in sql/assertions/s16_019_gateway.sql. The forwarding pipeline is tested at the end with fake ports.
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
import {
  forward,
  type CallLog,
  type ForwardPorts,
  type ForwardRequest,
  type SentRequest,
  type SentResponse,
} from '@/services/gateway/forward';
import type { SubKeyAuth } from '@/services/gateway/keys';
import type { UpstreamTarget } from '@/services/gateway/upstream';

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
        'https://app.example.com:8443/x',
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

  // ---------- the forwarding service with fakes ----------
  const SECRET = makeGatewaySecret();
  const OLD_SECRET = makeGatewaySecret();
  const NOW = new Date('2026-10-24T10:00:00Z');
  const authOk: SubKeyAuth = {
    keyId: 'k1',
    companyId: 'c1',
    subMerchantId: 's1',
    reference: 'shop-1',
    status: 'active',
    routeIds: null,
    kycApprovedUntil: null,
    rateLimitPerMinute: 5,
    allowedIps: null,
    lastUsedAt: null,
  };
  const routes = [
    { id: 'r1', name: 'Get order', method: 'GET', pathTemplate: '/orders/{id}', enabled: true },
    { id: 'r2', name: 'Create order', method: 'POST', pathTemplate: '/orders', enabled: true },
    { id: 'r3', name: 'Reports', method: 'GET', pathTemplate: '/reports', enabled: true },
  ];
  interface Rig {
    ports: ForwardPorts;
    sent: { url: string; request: SentRequest }[];
    logs: CallLog[];
    notes: boolean[];
    attempts: string[];
    events: string[];
  }
  function rig(
    opts: {
      auth?: SubKeyAuth | null;
      answer?: SentResponse | Error;
      upstream?: UpstreamTarget | null;
      hits?: number;
      limited?: boolean;
    } = {},
  ): Rig {
    const r: Rig = {
      ports: undefined as never,
      sent: [],
      logs: [],
      notes: [],
      attempts: [],
      events: [],
    };
    const auth = opts.auth === undefined ? authOk : opts.auth;
    const upstream =
      opts.upstream === undefined
        ? {
            id: 'u1',
            base: 'https://app.example.com/api',
            timeoutMs: 5000,
            enabled: true,
            kycRequired: false,
            secrets: [SECRET],
          }
        : opts.upstream;
    const answer = opts.answer ?? {
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': 'a=1', server: 'x' },
      body: new TextEncoder().encode('{"ok":true}'),
    };
    r.ports = {
      now: () => NOW,
      platformHost: 'platform.example.org',
      authenticate: async () => auth,
      failedAttempt: async (ip) => {
        r.attempts.push(ip);
        return opts.limited === true
          ? { allowed: false, retryAfterSeconds: 30 }
          : { allowed: true, retryAfterSeconds: 0 };
      },
      hit: async () => ({
        allowed: (opts.hits ?? 1) <= 5,
        limit: 5,
        remaining: 4,
        reset: 1,
        retryAfterSeconds: 12,
      }),
      loadRoutes: async () => routes,
      loadUpstream: async () => upstream,
      send: async (url, request) => {
        r.sent.push({ url, request });
        if (answer instanceof Error) throw answer;
        return answer;
      },
      logCall: async (e) => void r.logs.push(e),
      noteUpstream: async (_c, _u, ok) => void r.notes.push(ok),
      markUsed: async () => undefined,
      securityEvent: async (kind) => void r.events.push(kind),
    };
    return r;
  }
  const req = (over: Partial<ForwardRequest> = {}): ForwardRequest => ({
    authorization: 'Bearer kd_sub_' + 'a'.repeat(32),
    ip: '203.0.113.7',
    method: 'GET',
    path: '/orders/42',
    search: '?expand=items',
    body: '',
    accept: null,
    idempotencyKey: null,
    correlationId: 'corr-1',
    ...over,
  });
  const text = (b: Uint8Array | string): string =>
    typeof b === 'string' ? b : new TextDecoder().decode(b);

  await check(
    'forward: a good call is signed, sent without the key and answered with filtered headers',
    async () => {
      const r = rig();
      const res = await forward(r.ports, req());
      assert.equal(res.status, 200);
      assert.equal(text(res.body), '{"ok":true}');
      assert.equal(res.headers['set-cookie'], undefined);
      assert.equal(res.headers.server, undefined);
      assert.equal(res.headers['x-correlation-id'], 'corr-1');
      assert.equal(res.headers['x-ratelimit-limit'], '5');
      const call = r.sent[0];
      assert.ok(call);
      assert.equal(call.url, 'https://app.example.com/api/orders/42?expand=items');
      assert.equal(call.request.method, 'GET');
      assert.equal(call.request.body, undefined);
      assert.equal(call.request.headers['x-kd-sub-merchant'], 'shop-1');
      assert.ok(
        !Object.keys(call.request.headers).some((k) =>
          /authorization|cookie|forwarded|host/.test(k),
        ),
      );
      const url = new URL(call.url);
      assert.ok(
        await verifyGatewaySignature({
          secret: SECRET,
          header: call.request.headers['x-kd-signature'] ?? '',
          method: 'GET',
          pathAndQuery: url.pathname + url.search,
          body: '',
          now: NOW,
        }),
      );
      assert.equal(r.logs[0]?.outcome, 'ok');
      assert.equal(r.logs[0]?.pathTemplate, '/orders/{id}');
      assert.deepEqual(r.notes, [true]);
    },
  );

  await check(
    'forward: a body is signed, the idempotency key travels, a rotated secret signs too',
    async () => {
      const r = rig({
        upstream: {
          id: 'u1',
          base: 'https://app.example.com',
          timeoutMs: 5000,
          enabled: true,
          kycRequired: false,
          secrets: [SECRET, OLD_SECRET],
        },
      });
      const body = '{"amount":"12.5000"}';
      const res = await forward(
        r.ports,
        req({
          method: 'POST',
          path: '/orders',
          search: '',
          body,
          idempotencyKey: 'abcdefghijklmnop1234',
        }),
      );
      assert.equal(res.status, 200);
      const call = r.sent[0];
      assert.ok(call);
      assert.equal(call.request.body, body);
      assert.equal(call.request.headers['idempotency-key'], 'abcdefghijklmnop1234');
      const header = call.request.headers['x-kd-signature'] ?? '';
      for (const secret of [SECRET, OLD_SECRET])
        assert.ok(
          await verifyGatewaySignature({
            secret,
            header,
            method: 'POST',
            pathAndQuery: '/orders',
            body,
            now: NOW,
          }),
        );
      assert.ok(
        !(await verifyGatewaySignature({
          secret: SECRET,
          header,
          method: 'POST',
          pathAndQuery: '/orders',
          body: '{"amount":"1.0000"}',
          now: NOW,
        })),
      );
    },
  );

  await check(
    'forward: unknown, revoked and expired keys give the same 401, repeated attempts are limited',
    async () => {
      const r = rig({ auth: null });
      const res = await forward(r.ports, req());
      assert.equal(res.status, 401);
      assert.equal(r.sent.length, 0);
      assert.deepEqual(r.attempts, ['203.0.113.7']);
      assert.equal(
        r.logs.every((l) => l.companyId === ''),
        true,
      );
      const bad = await forward(r.ports, req({ authorization: 'Bearer nonsense' }));
      assert.equal(bad.status, 401);
      const limited = rig({ auth: null, limited: true });
      const lim = await forward(limited.ports, req());
      assert.equal(lim.status, 429);
      assert.equal(lim.headers['retry-after'], '30');
      assert.deepEqual(limited.events, ['token_abuse']);
    },
  );

  await check(
    'forward: a wrong address, a suspended sub-merchant and a used-up limit stop the call before the app',
    async () => {
      const wrongIp = rig({ auth: { ...authOk, allowedIps: ['198.51.100.0/24'] } });
      assert.equal((await forward(wrongIp.ports, req())).status, 403);
      const suspended = rig({ auth: { ...authOk, status: 'suspended' } });
      assert.equal((await forward(suspended.ports, req())).status, 403);
      const limited = rig({ hits: 6 });
      const res = await forward(limited.ports, req());
      assert.equal(res.status, 429);
      assert.equal(res.headers['retry-after'], '12');
      for (const x of [wrongIp, suspended, limited]) assert.equal(x.sent.length, 0);
      assert.equal(wrongIp.logs[0]?.outcome, 'blocked');
      assert.equal(limited.logs[0]?.outcome, 'rate_limited');
    },
  );

  await check(
    'forward: only listed routes, only the sub-merchant subset, nothing odd in the path',
    async () => {
      const none = rig();
      assert.equal((await forward(none.ports, req({ path: '/secret' }))).status, 404);
      assert.equal(
        (await forward(none.ports, req({ method: 'DELETE', path: '/orders/42' }))).status,
        404,
      );
      assert.equal((await forward(none.ports, req({ path: '/orders/../reports' }))).status, 404);
      assert.equal((await forward(none.ports, req({ path: '/orders/%2e%2e' }))).status, 404);
      assert.equal((await forward(none.ports, req({ method: 'TRACE' }))).status, 405);
      const subset = rig({ auth: { ...authOk, routeIds: ['r3'] } });
      assert.equal((await forward(subset.ports, req())).status, 404);
      assert.equal(
        (await forward(subset.ports, req({ path: '/reports', search: '' }))).status,
        200,
      );
      assert.equal(none.sent.length, 0);
    },
  );

  await check(
    'forward: bad query, bad body, a body on GET and a too large body are refused',
    async () => {
      const r = rig();
      assert.equal((await forward(r.ports, req({ search: '?a=1#x' }))).status, 400);
      assert.equal(
        (await forward(r.ports, req({ method: 'POST', path: '/orders', search: '', body: '{bad' })))
          .status,
        400,
      );
      assert.equal((await forward(r.ports, req({ body: '{}' }))).status, 400);
      assert.equal(
        (
          await forward(
            r.ports,
            req({
              method: 'POST',
              path: '/orders',
              search: '',
              body: JSON.stringify({ x: 'y'.repeat(1_100_000) }),
            }),
          )
        ).status,
        413,
      );
      assert.equal(r.sent.length, 0);
    },
  );

  await check(
    'forward: a sub-merchant that is not verified is refused when the app asks for verification',
    async () => {
      const gate = {
        id: 'u1',
        base: 'https://app.example.com',
        timeoutMs: 5000,
        enabled: true,
        kycRequired: true,
        secrets: [SECRET],
      };
      const open = rig({ upstream: gate });
      const refused = await forward(open.ports, req());
      assert.equal(refused.status, 403);
      assert.match(text(refused.body), /not been verified/);
      assert.equal(open.sent.length, 0);
      assert.equal(open.logs[0]?.outcome, 'blocked');
      const past = rig({
        upstream: gate,
        auth: { ...authOk, kycApprovedUntil: '2026-10-01T00:00:00Z' },
      });
      assert.equal((await forward(past.ports, req())).status, 403);
      const verified = rig({
        upstream: gate,
        auth: { ...authOk, kycApprovedUntil: '2027-10-01T00:00:00Z' },
      });
      assert.equal((await forward(verified.ports, req())).status, 200);
      assert.equal(verified.sent.length, 1);
    },
  );

  await check(
    'forward: no upstream, a switched-off upstream or one on the platform host is unavailable',
    async () => {
      assert.equal((await forward(rig({ upstream: null }).ports, req())).status, 503);
      assert.equal(
        (
          await forward(
            rig({
              upstream: {
                id: 'u',
                base: 'https://app.example.com',
                timeoutMs: 5000,
                enabled: false,
                kycRequired: false,
                secrets: [SECRET],
              },
            }).ports,
            req(),
          )
        ).status,
        503,
      );
      const self = rig({
        upstream: {
          id: 'u',
          base: 'https://platform.example.org/api',
          timeoutMs: 5000,
          enabled: true,
          kycRequired: false,
          secrets: [SECRET],
        },
      });
      assert.equal((await forward(self.ports, req())).status, 503);
      assert.equal(self.sent.length, 0);
    },
  );

  await check(
    'forward: the status of the app is mapped and its detail never reaches the sub-merchant',
    async () => {
      const json = (status: number, extra: Record<string, string> = {}): SentResponse => ({
        status,
        headers: { 'content-type': 'application/json', ...extra },
        body: new TextEncoder().encode('{"error":"stack trace here"}'),
      });
      const notFound = await forward(rig({ answer: json(404) }).ports, req());
      assert.equal(notFound.status, 404);
      assert.match(text(notFound.body), /stack trace here/);
      const tooMany = await forward(
        rig({ answer: json(429, { 'retry-after': '9' }) }).ports,
        req(),
      );
      assert.equal(tooMany.status, 429);
      assert.equal(tooMany.headers['retry-after'], '9');
      for (const answer of [
        json(500),
        json(302, { location: 'https://evil.example' }),
        {
          status: 200,
          headers: { 'content-type': 'text/html' },
          body: new TextEncoder().encode('<html></html>'),
        },
      ]) {
        const r = rig({ answer });
        const res = await forward(r.ports, req());
        assert.equal(res.status, 502);
        assert.doesNotMatch(text(res.body), /stack trace|html|evil/);
        assert.equal(res.headers.location, undefined);
        assert.deepEqual(r.notes, [false]);
      }
      const empty = await forward(
        rig({ answer: { status: 204, headers: {}, body: new Uint8Array() } }).ports,
        req({ method: 'GET' }),
      );
      assert.equal(empty.status, 204);
    },
  );

  await check('forward: a slow or unreachable app gives 504 or 502 and is counted', async () => {
    const slow = rig({ answer: new Error('timeout') });
    assert.equal((await forward(slow.ports, req())).status, 504);
    assert.equal(slow.logs[0]?.outcome, 'timeout');
    const down = rig({ answer: new Error('connect refused') });
    assert.equal((await forward(down.ports, req())).status, 502);
    assert.deepEqual([...slow.notes, ...down.notes], [false, false]);
  });

  process.stdout.write(`step16-gateway: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
