// path: scripts/verify/step01-core.ts
// Verification of the STEP 01 core libraries. Run: npx tsx scripts/verify/step01-core.ts
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { COUNTRIES, isCountryCode } from '@/config/countries';
import { PLANS } from '@/config/plans';
import { getService, hasService, registerService, tryGetService, unregisterService } from '@/lib/container';
import { createConfigEntitlementService } from '@/lib/entitlement/config-entitlement';
import { ConflictError, NotFoundError, RateLimitError, ServiceNotRegisteredError, toErrorBody, normalizeError } from '@/lib/errors';
import { withApi } from '@/lib/api/with-api';
import { redact, scrubString } from '@/lib/logger/redact';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { Money } from '@/lib/utils/currency';
import { addUtcMonths, parseIsoTimestamp } from '@/lib/utils/date';
import { formatMoney, maskEmail, maskTail } from '@/lib/utils/formatting';
import { base64UrlDecode, base64UrlEncode, hmacSha256Hex, sha256Hex, timingSafeEqualStrings } from '@/lib/utils/hash';
import { slugify } from '@/lib/utils/slug';
import { isUuid, uuidv7, uuidv7Timestamp } from '@/lib/utils/uuid';
import { idempotencyKeySchema, strictObject } from '@/schemas/common';
import type { Actor, SecurityService, StoredResponse } from '@/types/contracts';

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`ok    ${name}\n`);
  } catch (error) {
    failures.push(name);
    process.stdout.write(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

async function main(): Promise<void> {
  // ---- Money
  await check('Money: 0.1 + 0.2 is exactly 0.3000', () => {
    assert.equal(Money.parse('0.1').add('0.2').toDbString(), '0.3000');
  });
  await check('Money: rounds half up at the fourth place', () => {
    assert.equal(Money.parse('1.0000').mul('0.00005').toDbString(), '0.0001');
    assert.equal(Money.parse('10.00').percent('7.5').toDbString(), '0.7500');
    assert.equal(Money.parse('100').div('3').toDbString(), '33.3333');
  });
  await check('Money: parse rejects more than four decimals and non-numbers', () => {
    assert.throws(() => Money.parse('1.00001'));
    assert.throws(() => Money.parse('abc'));
    assert.throws(() => Money.parse('1e5'));
    assert.throws(() => Money.parse('99999999999999.99999'));
    assert.throws(() => Money.parse('100000000000000'));
  });
  await check('Money: allocate keeps every unit', () => {
    const parts = Money.parse('100.00').allocate([1, 1, 1]);
    assert.deepEqual(parts.map((p) => p.toDbString()), ['33.3334', '33.3333', '33.3333']);
    assert.equal(Money.sum(parts).toDbString(), '100.0000');
    const neg = Money.parse('-0.0005').allocate([1, 1, 1]);
    assert.equal(Money.sum(neg).toDbString(), '-0.0005');
    assert.equal(Money.parse('5').allocate([0, 2, 3]).map((p) => p.toDbString()).join(','), '0.0000,2.0000,3.0000');
  });
  await check('Money: comparison, sign and formatting', () => {
    const a = Money.parse('1234.5');
    assert.ok(a.gt('1234.4999') && a.lt('1234.5001') && a.eq('1234.5000'));
    assert.equal(formatMoney(a), '$1,234.50');
    assert.equal(formatMoney(Money.parse('-0.5')), '-$0.50');
    assert.equal(formatMoney(Money.parse('1000000'), 4), '$1,000,000.0000');
    assert.equal(Money.zero().isZero(), true);
    assert.equal(Money.parse('-0.0000').isNegative(), false);
    assert.equal(JSON.stringify({ a }), '{"a":"1234.5000"}');
    assert.equal(Money.max(Money.parse('1'), Money.parse('2')).toDbString(), '2.0000');
  });
  await check('Money: tax inclusive and discount order case', () => {
    const subtotal = Money.parse('199.99').mul('3');
    const discount = subtotal.percent('10');
    const taxable = subtotal.sub(discount);
    const tax = taxable.percent('8.25');
    assert.equal(subtotal.toDbString(), '599.9700');
    assert.equal(discount.toDbString(), '59.9970');
    assert.equal(tax.toDbString(), '44.5478');
    assert.equal(taxable.add(tax).toDbString(), '584.5208');
  });

  // ---- UUID v7
  await check('uuidv7: version, variant, ordering and timestamp', () => {
    const ids = Array.from({ length: 5000 }, () => uuidv7());
    for (const id of ids) {
      assert.ok(isUuid(id));
      assert.equal(id[14], '7');
      assert.ok('89ab'.includes(id[19] ?? ''));
    }
    const sorted = [...ids].sort();
    assert.deepEqual(sorted, ids, 'ids must be strictly increasing in generation order');
    assert.equal(new Set(ids).size, ids.length);
    const fixed = uuidv7(1_700_000_000_000 + 10_000_000);
    assert.ok(Math.abs(uuidv7Timestamp(fixed) - Date.now()) < 10_000_000_000);
  });

  // ---- Hash
  await check('hash: known SHA-256 and HMAC vectors', async () => {
    assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(
      await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog'),
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
    const bytes = new Uint8Array([0, 255, 128, 7, 250]);
    assert.deepEqual(base64UrlDecode(base64UrlEncode(bytes)), bytes);
    assert.equal(timingSafeEqualStrings('abc', 'abc'), true);
    assert.equal(timingSafeEqualStrings('abc', 'abd'), false);
    assert.equal(timingSafeEqualStrings('abc', 'abcd'), false);
  });

  // ---- Date, slug, formatting
  await check('date, slug and masking helpers', () => {
    assert.equal(addUtcMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString(), '2026-02-28T00:00:00.000Z');
    assert.equal(addUtcMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString(), '2028-02-29T00:00:00.000Z');
    assert.equal(addUtcMonths(new Date('2026-11-15T00:00:00Z'), 3).toISOString(), '2027-02-15T00:00:00.000Z');
    assert.throws(() => parseIsoTimestamp('2026-01-01T00:00:00'));
    assert.equal(slugify('  Café & Bar -- 2026! '), 'cafe-bar-2026');
    assert.equal(maskEmail('jane.doe@example.com'), 'j***@example.com');
    assert.equal(maskTail('sk_live_abcdef1234'), '****1234');
  });

  // ---- Redaction
  await check('redaction hides secrets, tokens, emails and card numbers', () => {
    const out = redact({
      password: 'hunter2',
      note: 'contact jane.doe@example.com card 4111 1111 1111 1111 ok',
      nested: { apiKey: 'abc', fine: 'yes', Authorization: 'Bearer x' },
      jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk',
      list: [{ session_id: 'x' }],
    }) as Record<string, unknown>;
    const text = JSON.stringify(out);
    assert.ok(!text.includes('hunter2'));
    assert.ok(!text.includes('jane.doe'));
    assert.ok(!text.includes('4111'));
    assert.ok(!text.includes('eyJhbGci'));
    assert.ok(text.includes('"fine":"yes"'));
    assert.equal(scrubString('order 1234567890123 total'), 'order 1234567890123 total');
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    assert.ok(JSON.stringify(redact(circular)).includes('[CIRCULAR]'));
  });

  // ---- Errors and correlation id
  await check('errors map to the standard response shape', () => {
    const body = toErrorBody(new ConflictError(), 'abc-123456');
    assert.deepEqual(Object.keys(body.error).sort(), ['code', 'correlation_id', 'details', 'message']);
    assert.equal(body.error.code, 'conflict');
    const unknown = normalizeError(new Error('database password is hunter2'));
    assert.equal(unknown.status, 500);
    assert.ok(!toErrorBody(unknown, 'x').error.message.includes('hunter2'));
    const parsed = z.object({ a: z.string() }).strict().safeParse({ a: 1, b: 2 });
    assert.ok(!parsed.success);
    if (!parsed.success) {
      const v = normalizeError(parsed.error);
      assert.equal(v.status, 400);
      assert.ok(!JSON.stringify(v.details).includes('"1"'));
    }
  });
  await check('correlation id: safe incoming ids kept, unsafe replaced', () => {
    assert.equal(resolveCorrelationId('abcd1234-efgh'), 'abcd1234-efgh');
    assert.notEqual(resolveCorrelationId('bad id with spaces'), 'bad id with spaces');
    assert.ok(isUuid(resolveCorrelationId(null)));
  });

  // ---- Container and entitlement
  await check('container: register, override, missing service', async () => {
    assert.throws(() => getService('wallet'), ServiceNotRegisteredError);
    const impl = { async credit() {}, async debit() {}, async hold() {}, async release() {} };
    registerService('wallet', impl);
    assert.equal(getService('wallet'), impl);
    assert.throws(() => registerService('wallet', impl));
    registerService('wallet', impl, { override: true });
    assert.equal(hasService('wallet'), true);
    unregisterService('wallet');
    assert.equal(tryGetService('wallet'), undefined);
  });
  await check('entitlement: config based plan checks', async () => {
    const svc = createConfigEntitlementService(async (id) => (id === 'c1' ? 'pro' : id === 'c2' ? 'free' : null));
    assert.equal(await svc.has('c1', 'api.access'), true);
    assert.equal(await svc.has('c2', 'api.access'), false);
    assert.equal(await svc.limit('c1', 'staff.seats'), 5);
    assert.equal(await svc.has('c3', 'api.access'), false);
    assert.equal(await svc.has('c1', 'not.a.key'), false);
    assert.equal(PLANS.enterprise.entitlements['invoices.monthly'], null);
    assert.equal(PLANS.free.entitlements['token.expiry_days'], 7);
  });
  await check('countries: ISO list is complete', () => {
    assert.equal(COUNTRIES.length, 249);
    assert.equal(new Set(COUNTRIES.map((c) => c.code)).size, 249);
    assert.ok(isCountryCode('BD') && isCountryCode('US') && !isCountryCode('ZZ'));
  });
  await check('schemas: idempotency key format', () => {
    assert.ok(idempotencyKeySchema.safeParse('abcdefghijklmnop').success);
    assert.ok(!idempotencyKeySchema.safeParse('short').success);
    assert.ok(!idempotencyKeySchema.safeParse('has spaces in it!!').success);
  });

  // ---- withApi pipeline with in-memory services
  const calls: string[] = [];
  const idempotencyStore = new Map<string, { hash: string; response?: StoredResponse }>();
  const actor: Actor = {
    userId: '0190a000-0000-7000-8000-000000000001',
    role: 'owner',
    subRole: null,
    companyId: '0190a000-0000-7000-8000-0000000000aa',
    email: 'owner@example.com',
    sessionId: 's1',
    impersonatedBy: null,
    authenticatedAt: new Date().toISOString(),
    lastStepUpAt: null,
    mfaVerified: true,
  };
  let currentActor: Actor | null = actor;
  let rateAllowed = true;
  let allowPermission = true;
  const security: SecurityService = {
    async rateLimit() {
      return { allowed: rateAllowed, remaining: 1, retryAfterSeconds: 30 };
    },
    async verifyTurnstile() {
      return true;
    },
    async checkNetwork(ip, context) {
      calls.push(`network:${context}`);
      return { vpn: false, proxy: false, tor: ip === '9.9.9.9', datacenter: false, countryCode: 'US', score: 0, allowed: ip !== '9.9.9.9', reason: null };
    },
    async riskScore() {
      return 0;
    },
    async raiseSecurityEvent(type) {
      calls.push(`event:${type}`);
    },
    sanitize<T>(input: T): T {
      return typeof input === 'string' ? (input.normalize('NFC').replace(/\u0000/g, '') as unknown as T) : input;
    },
  };
  registerService('security', security);
  registerService('auth', {
    async getActor() {
      return currentActor;
    },
    requireRole() {},
    async requireStepUp() {},
    async lockState() {
      return { locked: false, lockedUntil: null };
    },
  });
  registerService('tenant', {
    async getTenantContext() {
      return { companyId: actor.companyId ?? '', planKey: 'pro', dataRegion: 'sg', status: 'active' };
    },
    async assertSameTenant(id) {
      if (id !== actor.companyId) throw new NotFoundError();
    },
  });
  registerService('permissions', {
    async can() {
      return allowPermission;
    },
    async requireApproval() {
      return 'L0';
    },
  });
  registerService('audit', {
    async record(entry) {
      calls.push(`audit:${entry.action}`);
    },
    async verifyChain() {
      return { ok: true, checkedFrom: '0', checkedTo: '0', firstBrokenSequence: null, gaps: [] };
    },
  });
  registerService('idempotency', {
    async begin({ scope, key, requestHash }) {
      const id = `${scope}|${key}`;
      const found = idempotencyStore.get(id);
      if (!found) {
        idempotencyStore.set(id, { hash: requestHash });
        return { state: 'new' };
      }
      if (found.hash !== requestHash) return { state: 'conflict' };
      return found.response ? { state: 'replay', response: found.response } : { state: 'in_progress' };
    },
    async complete(scope, key, response) {
      const found = idempotencyStore.get(`${scope}|${key}`);
      if (found) found.response = response;
    },
    async release(scope, key) {
      idempotencyStore.delete(`${scope}|${key}`);
    },
  });

  const createInvoice = withApi(
    {
      id: 'invoices.create',
      scope: 'tenant',
      permission: { action: 'invoice.create', resourceType: 'invoice' },
      body: strictObject({ title: z.string().min(1).max(50) }),
      idempotent: true,
      networkContext: 'other',
    },
    async ({ body, tenant }) => ({
      status: 201,
      data: { title: body.title, company: tenant?.companyId },
      audit: { action: 'invoice.created', resourceType: 'invoice', resourceId: null },
    }),
  );
  const listItems = withApi(
    { id: 'items.list', scope: 'tenant', query: strictObject({ limit: z.coerce.number().int().min(1).max(50).default(10) }) },
    async ({ query }) => ({ data: { limit: query.limit } }),
  );
  const publicPing = withApi({ id: 'ping', scope: 'public' }, async () => ({ data: { ok: true } }));
  const forgetful = withApi({ id: 'forgetful.write', scope: 'tenant' }, async () => ({ data: {} }));

  const post = (url: string, body: unknown, headers: Record<string, string> = {}): NextRequest =>
    new NextRequest(`http://localhost${url}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'key-aaaaaaaaaaaaaaaa', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  const readJson = async (response: Response): Promise<Record<string, unknown>> => (await response.json()) as Record<string, unknown>;

  await check('withApi: success runs the full pipeline and audits', async () => {
    calls.length = 0;
    const res = await createInvoice(post('/api/invoices', { title: 'Hello' }), {});
    assert.equal(res.status, 201);
    const json = await readJson(res);
    assert.deepEqual((json.data as Record<string, unknown>).title, 'Hello');
    assert.ok(res.headers.get('x-correlation-id'));
    assert.deepEqual(calls, ['network:other', 'audit:invoice.created']);
  });
  await check('withApi: replay returns the stored response without running the handler again', async () => {
    calls.length = 0;
    const res = await createInvoice(post('/api/invoices', { title: 'Hello' }), {});
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('idempotent-replayed'), 'true');
    assert.ok(!calls.includes('audit:invoice.created'));
  });
  await check('withApi: same key with a different body conflicts', async () => {
    const res = await createInvoice(post('/api/invoices', { title: 'Other' }), {});
    assert.equal(res.status, 409);
    assert.equal(((await readJson(res)).error as Record<string, unknown>).code, 'idempotency_conflict');
  });
  await check('withApi: missing idempotency key, unknown field, bad json and wrong type are rejected', async () => {
    const noKey = new NextRequest('http://localhost/api/invoices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    });
    assert.equal((await createInvoice(noKey, {})).status, 400);
    assert.equal((await createInvoice(post('/api/invoices', { title: 'x', role: 'admin' }, { 'idempotency-key': 'key-bbbbbbbbbbbbbbbb' }), {})).status, 400);
    assert.equal((await createInvoice(post('/api/invoices', '{bad', { 'idempotency-key': 'key-cccccccccccccccc' }), {})).status, 400);
    const text = new NextRequest('http://localhost/api/invoices', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'idempotency-key': 'key-dddddddddddddddd' },
      body: 'title=x',
    });
    assert.equal((await createInvoice(text, {})).status, 400);
  });
  await check('withApi: a failed attempt releases the idempotency key for retry', async () => {
    const res = await createInvoice(post('/api/invoices', { title: '' }, { 'idempotency-key': 'key-eeeeeeeeeeeeeeee' }), {});
    assert.equal(res.status, 400);
    assert.equal(idempotencyStore.has(`${actor.companyId}:invoices.create|key-eeeeeeeeeeeeeeee`), false);
  });
  await check('withApi: oversized body is refused', async () => {
    const big = JSON.stringify({ title: 'x'.repeat(2_000_000) });
    const res = await createInvoice(post('/api/invoices', big, { 'idempotency-key': 'key-ffffffffffffffff' }), {});
    assert.equal(res.status, 413);
  });
  await check('withApi: unauthenticated, forbidden and rate limited requests fail closed', async () => {
    currentActor = null;
    assert.equal((await listItems(new NextRequest('http://localhost/api/items'), {})).status, 401);
    currentActor = actor;
    allowPermission = false;
    assert.equal((await createInvoice(post('/api/invoices', { title: 'x' }, { 'idempotency-key': 'key-gggggggggggggggg' }), {})).status, 403);
    allowPermission = true;
    rateAllowed = false;
    const limited = await publicPing(new NextRequest('http://localhost/api/ping'), {});
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '30');
    rateAllowed = true;
  });
  await check('withApi: blocked network is refused', async () => {
    const req = post('/api/invoices', { title: 'x' }, { 'idempotency-key': 'key-hhhhhhhhhhhhhhhh', 'cf-connecting-ip': '9.9.9.9' });
    const res = await createInvoice(req, {});
    assert.equal(res.status, 403);
    assert.equal(((await readJson(res)).error as Record<string, unknown>).code, 'network_blocked');
  });
  await check('withApi: query parsing, defaults and strictness', async () => {
    const ok = await listItems(new NextRequest('http://localhost/api/items?limit=5'), {});
    assert.equal(((await readJson(ok)).data as Record<string, unknown>).limit, 5);
    const def = await listItems(new NextRequest('http://localhost/api/items'), {});
    assert.equal(((await readJson(def)).data as Record<string, unknown>).limit, 10);
    assert.equal((await listItems(new NextRequest('http://localhost/api/items?limit=500'), {})).status, 400);
    assert.equal((await listItems(new NextRequest('http://localhost/api/items?limit=5&admin=1'), {})).status, 400);
  });
  await check('withApi: a mutating route without an audit entry fails closed', async () => {
    const res = await forgetful(post('/api/forgetful', {}, {}), {});
    assert.equal(res.status, 500);
    assert.ok(!JSON.stringify(await readJson(res)).includes('must return an audit entry'));
  });
  await check('withApi: non-strict schemas are rejected when the route is defined', () => {
    assert.throws(() => withApi({ id: 'loose', scope: 'public', body: z.object({ a: z.string() }) }, async () => ({ data: {} })));
  });
  await check('withApi: missing service answers 503 instead of continuing', async () => {
    unregisterService('security');
    const res = await publicPing(new NextRequest('http://localhost/api/ping'), {});
    assert.equal(res.status, 503);
    registerService('security', security);
  });
  await check('RateLimitError carries retry seconds', () => {
    assert.equal(new RateLimitError(12).retryAfterSeconds, 12);
  });

  process.stdout.write(`\nstep01-core: ${passed} passed, ${failures.length} failed\n`);
  if (failures.length > 0) process.exit(1);
}

main().catch((error: unknown) => {
  process.stdout.write(`step01-core crashed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
