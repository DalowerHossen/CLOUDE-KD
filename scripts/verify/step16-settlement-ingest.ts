// path: scripts/verify/step16-settlement-ingest.ts
// Logic checks of the automatic settlement entries (16.15) that need no database or network: the key (format, hash, header), the
// inputs, and the whole pipeline with fake ports: wrong or revoked keys, the address list, the limit of the key, bad or too large
// bodies, an unknown or closed sub-merchant, and a good batch that is handed on once.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-settlement-ingest.ts
import assert from 'node:assert/strict';
import {
  INGEST_MAX_BODY_BYTES,
  ingestBatch,
  ingestKeyFromHeader,
  ingestKeyInput,
  makeIngestKey,
} from '@/lib/gateway/ingest-rules';
import { ingest, type IngestPorts, type IngestRequest } from '@/services/gateway/ingest';
import type { IngestKeyAuth } from '@/services/gateway/ingest-keys';

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

const NOW = new Date('2026-10-24T10:00:00Z');
const auth: IngestKeyAuth = {
  keyId: 'k1',
  companyId: 'c1',
  rateLimitPerMinute: 5,
  allowedIps: null,
  lastUsedAt: null,
};
const entry = {
  kind: 'sale',
  amount: '100.00',
  externalRef: 'order-1',
  occurredAt: '2026-10-24T09:00:00Z',
};
const body = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ subMerchantReference: 'shop-1', entries: [entry], ...extra });

interface Rig {
  ports: IngestPorts;
  posted: { subId: string; count: number }[];
  attempts: string[];
  events: string[];
}
function rig(
  opts: {
    auth?: IngestKeyAuth | null;
    over?: boolean;
    limited?: boolean;
    sub?: 'active' | 'closed' | null;
  } = {},
): Rig {
  const r: Rig = { ports: undefined as never, posted: [], attempts: [], events: [] };
  const found = opts.auth === undefined ? auth : opts.auth;
  const sub = opts.sub === undefined ? 'active' : opts.sub;
  r.ports = {
    now: () => NOW,
    authenticate: async () => found,
    failedAttempt: async (ip) => {
      r.attempts.push(ip);
      return opts.limited
        ? { allowed: false, retryAfterSeconds: 30 }
        : { allowed: true, retryAfterSeconds: 0 };
    },
    hit: async () => ({ allowed: !opts.over, retryAfterSeconds: 11 }),
    findSubMerchant: async () => (sub === null ? null : { id: 's1', status: sub }),
    post: async (_a, subId, entries) => {
      r.posted.push({ subId, count: entries.length });
      return { posted: entries.length, duplicates: [], failed: [] };
    },
    markUsed: async () => undefined,
    securityEvent: async (kind) => void r.events.push(kind),
  };
  return r;
}
const req = (over: Partial<IngestRequest> = {}): IngestRequest => ({
  authorization: 'Bearer kd_stl_' + 'a'.repeat(32),
  ip: '203.0.113.7',
  rawBody: body(),
  correlationId: 'corr-1',
  ...over,
});

async function main(): Promise<void> {
  await check('key: format, one-way hash, header reading', async () => {
    const key = await makeIngestKey();
    assert.match(key.secret, /^kd_stl_[0-9A-Za-z]{32}$/);
    assert.equal(key.hash.length, 64);
    assert.ok(!key.hash.includes(key.secret));
    assert.equal(key.lastChars, key.secret.slice(-4));
    assert.equal(ingestKeyFromHeader(`Bearer ${key.secret}`), key.secret);
    assert.equal(ingestKeyFromHeader(key.secret), null);
    assert.equal(ingestKeyFromHeader('Bearer kd_sub_' + 'a'.repeat(32)), null);
    assert.equal(ingestKeyFromHeader('Bearer kd_live_' + 'a'.repeat(32)), null);
    assert.equal(ingestKeyFromHeader(null), null);
    assert.notEqual((await makeIngestKey()).secret, key.secret);
  });

  await check('inputs: key limits, batch by reference, 1 to 200 entries, strict', () => {
    const k = ingestKeyInput.parse({ name: 'App' });
    assert.equal(k.rateLimitPerMinute, 60);
    assert.equal(ingestKeyInput.safeParse({ name: 'App', rateLimitPerMinute: 0 }).success, false);
    assert.equal(ingestKeyInput.safeParse({ name: 'App', allowedIps: ['nope'] }).success, false);
    assert.ok(ingestBatch.safeParse({ subMerchantReference: 'shop-1', entries: [entry] }).success);
    assert.equal(
      ingestBatch.safeParse({ subMerchantReference: 'has space', entries: [entry] }).success,
      false,
    );
    assert.equal(
      ingestBatch.safeParse({ subMerchantReference: 'shop-1', entries: [] }).success,
      false,
    );
    assert.equal(
      ingestBatch.safeParse({
        subMerchantReference: 'shop-1',
        entries: Array.from({ length: 201 }, () => entry),
      }).success,
      false,
    );
    assert.equal(
      ingestBatch.safeParse({ subMerchantReference: 'shop-1', entries: [entry], extra: 1 }).success,
      false,
    );
    assert.equal(
      ingestBatch.safeParse({
        subMerchantReference: 'shop-1',
        entries: [{ ...entry, amount: '-5' }],
      }).success,
      false,
    );
  });

  await check('a good batch is handed on once and answered 201', async () => {
    const r = rig();
    const res = await ingest(r.ports, req());
    assert.equal(res.status, 201);
    assert.deepEqual(r.posted, [{ subId: 's1', count: 1 }]);
    assert.deepEqual((res.body as { data: unknown }).data, {
      posted: 1,
      duplicates: [],
      failed: [],
    });
    assert.equal(res.headers['x-correlation-id'], 'corr-1');
  });

  await check(
    'wrong, revoked and expired keys give the same 401; repeated attempts are limited',
    async () => {
      const r = rig({ auth: null });
      const res = await ingest(r.ports, req());
      assert.equal(res.status, 401);
      assert.deepEqual(r.attempts, ['203.0.113.7']);
      assert.equal((await ingest(r.ports, req({ authorization: 'Bearer nonsense' }))).status, 401);
      assert.equal((await ingest(r.ports, req({ authorization: null }))).status, 401);
      assert.equal(r.posted.length, 0);
      const limited = rig({ auth: null, limited: true });
      const lim = await ingest(limited.ports, req());
      assert.equal(lim.status, 429);
      assert.equal(lim.headers['retry-after'], '30');
      assert.deepEqual(limited.events, ['token_abuse']);
    },
  );

  await check(
    'a wrong address and a used-up limit stop the call before anything is posted',
    async () => {
      const wrong = rig({ auth: { ...auth, allowedIps: ['198.51.100.0/24'] } });
      assert.equal((await ingest(wrong.ports, req())).status, 403);
      const over = rig({ over: true });
      const res = await ingest(over.ports, req());
      assert.equal(res.status, 429);
      assert.equal(res.headers['retry-after'], '11');
      assert.equal(wrong.posted.length + over.posted.length, 0);
      const inside = rig({ auth: { ...auth, allowedIps: ['203.0.113.0/24'] } });
      assert.equal((await ingest(inside.ports, req())).status, 201);
    },
  );

  await check('bad JSON, a bad batch and a too large body are refused', async () => {
    const r = rig();
    assert.equal((await ingest(r.ports, req({ rawBody: '{bad' }))).status, 400);
    assert.equal((await ingest(r.ports, req({ rawBody: '[]' }))).status, 400);
    assert.equal((await ingest(r.ports, req({ rawBody: body({ entries: [] }) }))).status, 400);
    const big = JSON.stringify({
      subMerchantReference: 'shop-1',
      entries: [{ ...entry, note: 'x'.repeat(INGEST_MAX_BODY_BYTES) }],
    });
    assert.equal((await ingest(r.ports, req({ rawBody: big }))).status, 413);
    assert.equal(r.posted.length, 0);
  });

  await check('an unknown sub-merchant is 404 and a closed one is 409', async () => {
    const none = rig({ sub: null });
    assert.equal((await ingest(none.ports, req())).status, 404);
    const closed = rig({ sub: 'closed' });
    assert.equal((await ingest(closed.ports, req())).status, 409);
    assert.equal(none.posted.length + closed.posted.length, 0);
  });

  process.stdout.write(`step16-settlement-ingest: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
