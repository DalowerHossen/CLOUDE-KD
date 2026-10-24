// path: scripts/verify/step16-api-keys.ts
// Logic checks of the public API keys (16.1.a) that need no database: the scopes and the 403 rule, how a key is made (shown once,
// only a hash kept, test prefix for sandbox), the Authorization header, key state and rotation overlap, the minute window and
// the X-RateLimit headers, the usage anomaly rule, the inputs, and the public API wrapper for a call without a valid key (401 and
// the limit on repeated failures, with fake services). Key lookup, the minute counter and the day counter use the database
// functions tested in sql/assertions/s16_001_api_keys.sql; a call with a real key needs a running app.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-api-keys.ts
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  ALL_SCOPES,
  dataSourceFor,
  expiryFromDays,
  hashKey,
  isScope,
  isUsageAnomaly,
  keyFromHeader,
  keyInput,
  keyState,
  keyUpdate,
  makeKey,
  maskedKey,
  modeOfSecret,
  oldKeyExpiry,
  rateHeaders,
  rateState,
  rotateInput,
  scopeAllows,
  scopeFor,
  windowStart,
} from '@/lib/integrations/api-key-rules';
import { withPublicApi } from '@/lib/integrations/public-api';
import { registerService, unregisterService } from '@/lib/container';

let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve()
    .then(fn)
    .then(() => {
      checks += 1;
    })
    .catch((error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    });

async function main(): Promise<void> {
  await check(
    'scopes: a missing scope is refused, write includes read, reads never include writes',
    () => {
      assert.ok(scopeAllows(['read:invoices'], 'read:invoices'));
      assert.ok(!scopeAllows(['read:invoices'], 'write:invoices'));
      assert.ok(!scopeAllows(['read:invoices'], 'read:clients'));
      assert.ok(scopeAllows(['write:clients'], 'read:clients'));
      assert.ok(!scopeAllows(['write:clients'], 'write:invoices'));
      assert.equal(scopeFor('GET', 'invoices'), 'read:invoices');
      assert.equal(scopeFor('post', 'clients'), 'write:clients');
      assert.equal(scopeFor('DELETE', 'products'), 'write:products');
    },
  );

  await check('payments are read only; unknown scopes are refused', () => {
    assert.ok(isScope('read:payments'));
    assert.ok(!isScope('write:payments'));
    assert.ok(!isScope('read:users'));
    assert.ok(ALL_SCOPES.includes('write:estimates'));
  });

  await check(
    'a live key has the live prefix, a sandbox key the test prefix; only the hash is derived',
    async () => {
      const live = await makeKey('live');
      const test = await makeKey('sandbox');
      assert.match(live.secret, /^kd_live_[0-9A-Za-z]{32}$/);
      assert.match(test.secret, /^kd_test_[0-9A-Za-z]{32}$/);
      assert.equal(modeOfSecret(live.secret), 'live');
      assert.equal(modeOfSecret(test.secret), 'sandbox');
      assert.equal(live.hash, await hashKey(live.secret));
      assert.match(live.hash, /^[0-9a-f]{64}$/);
      assert.ok(!live.hash.includes(live.secret.slice(10)));
      assert.equal(live.prefix, live.secret.slice(0, 14));
      assert.equal(live.lastChars, live.secret.slice(-4));
      assert.notEqual((await makeKey('live')).secret, live.secret);
    },
  );

  await check('the masked text shows the beginning and the last characters only', async () => {
    const k = await makeKey('live');
    const masked = maskedKey(k.prefix, k.lastChars);
    assert.ok(masked.startsWith(k.prefix) && masked.endsWith(k.lastChars));
    assert.ok(!masked.includes(k.secret.slice(14, 30)));
  });

  await check('the Authorization header must be Bearer with a key of the right shape', async () => {
    const k = await makeKey('live');
    assert.equal(keyFromHeader(`Bearer ${k.secret}`), k.secret);
    assert.equal(keyFromHeader(`bearer ${k.secret}`), k.secret);
    assert.equal(keyFromHeader(k.secret), null);
    assert.equal(keyFromHeader('Bearer short'), null);
    assert.equal(keyFromHeader(`Basic ${k.secret}`), null);
    assert.equal(keyFromHeader(`Bearer ${k.secret} extra`), null);
    assert.equal(keyFromHeader(null), null);
  });

  await check('key state: active, expired, revoked (revoked wins)', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    assert.equal(keyState({ expiresAt: null, revokedAt: null }, now), 'active');
    assert.equal(keyState({ expiresAt: '2026-07-01T00:00:00Z', revokedAt: null }, now), 'active');
    assert.equal(keyState({ expiresAt: '2026-06-01T00:00:00Z', revokedAt: null }, now), 'expired');
    assert.equal(
      keyState({ expiresAt: '2026-07-01T00:00:00Z', revokedAt: '2026-05-01T00:00:00Z' }, now),
      'revoked',
    );
  });

  await check(
    'rotation: the old key works for the overlap, never longer than its own expiry',
    () => {
      const now = new Date('2026-06-01T00:00:00Z');
      assert.equal(oldKeyExpiry(now, 24, null), '2026-06-02T00:00:00.000Z');
      assert.equal(oldKeyExpiry(now, 24, '2026-06-01T06:00:00Z'), '2026-06-01T06:00:00.000Z');
      assert.equal(oldKeyExpiry(now, 0, null), '2026-06-01T00:00:00.000Z');
      assert.equal(expiryFromDays(now, 30), '2026-07-01T00:00:00.000Z');
      assert.equal(expiryFromDays(now, null), null);
    },
  );

  await check(
    'rate limit: counts inside the minute, headers show limit, remaining and reset',
    () => {
      const now = new Date('2026-06-01T10:00:20Z');
      assert.equal(windowStart(now), '2026-06-01T10:00:00.000Z');
      const ok = rateState(5, 120, now);
      assert.ok(ok.allowed);
      assert.equal(ok.remaining, 115);
      assert.equal(ok.reset, Date.parse('2026-06-01T10:01:00Z') / 1000);
      assert.deepEqual(rateHeaders(ok), {
        'x-ratelimit-limit': '120',
        'x-ratelimit-remaining': '115',
        'x-ratelimit-reset': String(ok.reset),
      });
      const last = rateState(120, 120, now);
      assert.ok(last.allowed && last.remaining === 0);
      const over = rateState(121, 120, now);
      assert.ok(!over.allowed);
      assert.equal(over.remaining, 0);
      assert.equal(over.retryAfterSeconds, 40);
    },
  );

  await check('usage anomaly: only a busy day far above the average counts', () => {
    assert.ok(!isUsageAnomaly(150, [0, 0, 0, 0, 0, 0, 0]));
    assert.ok(isUsageAnomaly(1000, [10, 20, 0, 0, 5, 0, 0]));
    assert.ok(!isUsageAnomaly(1000, [900, 1100, 1000, 950, 1050, 1000, 980]));
    assert.ok(!isUsageAnomaly(1000, []));
  });

  await check('a sandbox key reads the sandbox data and a live key the live tables', () => {
    assert.equal(dataSourceFor('sandbox'), 'sandbox');
    assert.equal(dataSourceFor('live'), 'live');
  });

  await check(
    'inputs are strict: unknown scope, empty scopes, repeated scope, angle brackets, bad limits',
    () => {
      const base = { name: 'Billing', scopes: ['read:invoices'] };
      const ok = keyInput.safeParse(base);
      assert.ok(ok.success);
      assert.equal(ok.success && ok.data.rateLimitPerMinute, 120);
      assert.equal(ok.success && ok.data.mode, 'live');
      assert.ok(!keyInput.safeParse({ ...base, scopes: [] }).success);
      assert.ok(!keyInput.safeParse({ ...base, scopes: ['read:users'] }).success);
      assert.ok(
        !keyInput.safeParse({ ...base, scopes: ['read:invoices', 'read:invoices'] }).success,
      );
      assert.ok(!keyInput.safeParse({ ...base, name: '<b>x' }).success);
      assert.ok(!keyInput.safeParse({ ...base, rateLimitPerMinute: 0 }).success);
      assert.ok(!keyInput.safeParse({ ...base, rateLimitPerMinute: 10001 }).success);
      assert.ok(!keyInput.safeParse({ ...base, expiresInDays: 731 }).success);
      assert.ok(!keyInput.safeParse({ ...base, secret: 'x' }).success);
      assert.ok(!keyUpdate.safeParse({ name: 'x' }).success);
      assert.ok(keyUpdate.safeParse({ version: 2, name: 'x' }).success);
      assert.ok(!rotateInput.safeParse({ overlapHours: 73 }).success);
      assert.equal(rotateInput.parse({}).overlapHours, 24);
    },
  );

  await check(
    'the public API wrapper answers 401 without a valid key and limits repeated failures',
    async () => {
      const events: string[] = [];
      let attempts = 0;
      const noop = async (): Promise<void> => undefined;
      registerService('security', {
        rateLimit: async () => {
          attempts += 1;
          return { allowed: attempts <= 2, remaining: 0, retryAfterSeconds: 30 };
        },
        verifyTurnstile: async () => true,
        checkNetwork: async () => ({
          vpn: false,
          proxy: false,
          tor: false,
          datacenter: false,
          countryCode: null,
          score: 0,
          allowed: true,
          reason: null,
        }),
        riskScore: async () => 0,
        raiseSecurityEvent: async (type) => {
          events.push(type);
        },
        sanitize: <T>(v: T): T => v,
      });
      registerService('idempotency', {
        begin: async () => ({ state: 'new' as const }),
        complete: noop,
        release: noop,
      });
      registerService('audit', {
        record: noop,
        verifyChain: async () => ({
          ok: true,
          checkedFrom: '',
          checkedTo: '',
          firstBrokenSequence: null,
          gaps: [],
        }),
      });
      try {
        const route = withPublicApi(
          { id: 'public.test.list', resource: 'clients', query: z.object({}).strict() },
          async () => ({ data: [] }),
        );
        const call = (header?: string): Promise<Response> =>
          route(
            new NextRequest('http://localhost/api/public/v1/clients', {
              headers: header ? { authorization: header } : {},
            }),
            {},
          );
        const first = await call();
        assert.equal(first.status, 401);
        const body = (await first.json()) as { error: { code: string } };
        assert.ok(body.error.code.length > 0);
        assert.equal(first.headers.get('x-api-version'), 'v1');
        assert.equal((await call('Bearer nonsense')).status, 401);
        const third = await call();
        assert.equal(third.status, 429);
        assert.ok(third.headers.get('retry-after'));
        assert.deepEqual(events, ['token_abuse']);
      } finally {
        unregisterService('security');
        unregisterService('idempotency');
        unregisterService('audit');
      }
    },
  );

  process.stdout.write(`step16-api-keys: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
