// path: scripts/verify/step12-custom.ts
// Checks the custom adapter against a local fake transport (docs/processors/custom.md). The fake replaces the
// guarded client only after the address checks, so the static SSRF checks are exercised for real; the DNS and
// connect-time checks are the platform guard's own (lib/security/ssrf.ts) and are exercised here with literal
// addresses. It does NOT replace the owner's own test endpoint run described in docs/processors/custom.verify.md.
// Run: npx tsx --conditions=react-server scripts/verify/step12-custom.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { adapter } from '@/lib/payment/adapters/custom';
import {
  at,
  setCustomTransportForVerification,
  type GuardedRequest,
  type GuardedResponse,
} from '@/lib/payment/adapters/custom/api';
import { adapterProblems } from '@/lib/payment/capabilities';
import { resolvePublicAddresses } from '@/lib/security/ssrf';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, AuthorizeInput } from '@/types/contracts';

const baseCredentials: Record<string, string> = {
  baseUrl: 'https://pay.example.com/gw',
  authScheme: 'bearer',
  authSecret: 'tok_0123456789',
  testPath: '/ping',
  sessionPath: '/sessions',
  lookupPath: '/payments/{id}',
  refundPath: '/payments/{id}/refunds',
  webhookSecret: 'whsec-0123456789',
  signatureHeader: 'X-Gateway-Signature',
};
const ctxOf = (over: Record<string, string> = {}): AdapterContext => ({
  credentials: { ...baseCredentials, ...over },
  environment: 'sandbox',
  mode: 'hosted_gateway',
  correlationId: 'c1',
});
const ctx = ctxOf();
const input: AuthorizeInput = {
  idempotencyKey: 'a3c1f2d4-1111-4222-8333-444455556666:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'inv-uuid-1',
  companyId: 'co',
  paymentToken: 'pay_123',
  billing: { postalCode: null, country: null },
  payerIp: '203.0.113.5',
  returnUrl: 'https://app.example.com/pay/x',
  threeDS: 'disabled',
  metadata: {},
};

type Json = Record<string, unknown>;
type Reply = { status?: number; body: unknown };
const seen: GuardedRequest[] = [];
let routes = new Map<string, Reply>();
const route = (key: string, reply: Reply): void => void routes.set(key, reply);
setCustomTransportForVerification(async (request): Promise<GuardedResponse> => {
  seen.push(request);
  const found = routes.get(`${request.method} ${new URL(request.url).pathname}`);
  const reply = found ?? { status: 404, body: {} };
  return { status: reply.status ?? 200, text: JSON.stringify(reply.body) };
});

const lookupBody = (over: Json = {}): Json => ({
  id: 'pay_123',
  status: 'paid',
  amount: '120.50',
  currency: 'USD',
  reference: 'inv-uuid-1',
  ...over,
});
const bodyOf = (r: GuardedRequest | undefined): Json => JSON.parse(r?.body ?? '{}') as Json;

let checks = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  routes = new Map();
  seen.length = 0;
  try {
    await fn();
    checks += 1;
  } catch (e) {
    process.stderr.write(`FAIL ${name}\n`);
    throw e;
  }
}
const session = (c: AdapterContext = ctx): ReturnType<typeof adapter.createCheckoutSession> =>
  adapter.createCheckoutSession(c, {
    idempotencyKey: 'k1',
    amount: input.amount,
    invoiceId: 'inv-uuid-1',
    companyId: 'co',
    returnUrl: input.returnUrl,
    threeDS: 'disabled',
  });
const sign = (
  raw: string,
  secret = 'whsec-0123456789',
  encoding: 'hex' | 'base64' = 'hex',
): string => createHmac('sha256', secret).update(raw).digest(encoding);

async function main(): Promise<void> {
  await check('contract: one-step hosted gateway', () => {
    assert.deepEqual(adapterProblems(adapter), []);
    assert.equal(adapter.capabilities.supportsAuthCapture, false);
    assert.equal(adapter.capabilities.isMerchantOfRecord, false);
    assert.equal(adapter.capture, undefined);
    assert.ok(adapter.charge);
    for (const field of adapter.credentialFields) {
      const value = baseCredentials[field.key];
      if (value !== undefined) assert.ok(new RegExp(field.pattern ?? '').test(value), field.key);
    }
    assert.equal(adapter.cardIdentity({} as never), null);
  });

  await check('SSRF: unsafe base addresses are refused before any call', async () => {
    const unsafe = [
      'http://pay.example.com',
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://10.0.0.5/x',
      'https://192.168.1.1/x',
      'https://169.254.169.254/latest',
      'https://[::1]/x',
      'https://2130706433/x',
      'https://127.1/x',
      'https://user:pw@pay.example.com/x',
      'https://pay.example.com:8443/x',
      'https://service.internal/x',
      'https://printer.local/x',
    ];
    for (const baseUrl of unsafe) {
      const result = await adapter.testConnection(ctxOf({ baseUrl }));
      assert.equal(result.ok, false, baseUrl);
      assert.equal(seen.length, 0, baseUrl);
    }
    await assert.rejects(resolvePublicAddresses('127.0.0.1'), /private/);
    await assert.rejects(resolvePublicAddresses('10.1.2.3'), /private/);
    assert.deepEqual(await resolvePublicAddresses('93.184.216.34'), ['93.184.216.34']);
  });

  await check('SSRF: paths cannot leave the base', async () => {
    route('GET /ping', { body: {} });
    for (const testPath of [
      '/../admin',
      '//evil.com/x',
      'https://evil.com/x',
      '/a?b=1',
      '/a#b',
      'ping',
      '/{id}',
    ]) {
      const result = await adapter.testConnection(ctxOf({ testPath }));
      assert.equal(result.ok, false, testPath);
    }
    assert.equal(seen.length, 0);
    await assert.rejects(
      adapter.getTransaction?.(ctx, '../../etc') ?? Promise.resolve(),
      ValidationError,
    );
  });

  await check('SSRF: redirects are not followed', async () => {
    route('GET /gw/ping', { status: 302, body: {} });
    const result = await adapter.testConnection(ctx);
    assert.equal(result.ok, false);
    assert.equal(seen.length, 1);
  });

  await check('connection test and authentication schemes', async () => {
    route('GET /gw/ping', { body: { ok: true } });
    assert.equal((await adapter.testConnection(ctx)).ok, true);
    assert.equal(seen[0]?.url, 'https://pay.example.com/gw/ping');
    assert.equal(seen[0]?.headers.authorization, 'Bearer tok_0123456789');
    seen.length = 0;
    await adapter.testConnection(ctxOf({ authScheme: 'basic', authSecret: 'user:p:w' }));
    assert.equal(
      seen[0]?.headers.authorization,
      `Basic ${Buffer.from('user:p:w').toString('base64')}`,
    );
    seen.length = 0;
    await adapter.testConnection(
      ctxOf({ authScheme: 'header', authHeaderName: 'X-Key', authSecret: 'abc' }),
    );
    assert.equal(seen[0]?.headers['x-key'], 'abc');
    seen.length = 0;
    await adapter.testConnection(ctxOf({ authScheme: 'none', authSecret: '' }));
    assert.equal(seen[0]?.headers.authorization, undefined);
    assert.equal(
      (await adapter.testConnection(ctxOf({ authScheme: 'bearer', authSecret: '' }))).ok,
      false,
    );
    assert.equal((await adapter.testConnection(ctxOf({ authScheme: 'magic' }))).ok, false);
    route('GET /gw/ping', { status: 401, body: {} });
    const refused = await adapter.testConnection(ctx);
    assert.equal(refused.ok, false);
    assert.ok(!refused.message.includes('tok_0123456789'));
    route('GET /gw/ping', { status: 503, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
  });

  await check('checkout session: request formats and returned address', async () => {
    route('POST /gw/sessions', {
      status: 201,
      body: { checkout_url: 'https://pay.example.com/c/abc' },
    });
    const result = await session();
    assert.deepEqual(result.clientConfig, { checkoutUrl: 'https://pay.example.com/c/abc' });
    assert.deepEqual(bodyOf(seen[0]), {
      currency: 'USD',
      reference: 'inv-uuid-1',
      return_url: input.returnUrl,
      amount: '120.50',
    });
    assert.match(seen[0]?.headers['idempotency-key'] ?? '', /^[0-9a-f]{40}$/);
    seen.length = 0;
    await session(ctxOf({ amountFormat: 'decimal_number' }));
    assert.ok(seen[0]?.body?.includes('"amount":120.50'));
    seen.length = 0;
    await session(ctxOf({ amountFormat: 'minor_number', fieldAmount: 'total_cents' }));
    assert.ok(seen[0]?.body?.includes('"total_cents":12050'));
    // checkout on a sub-domain of the gateway host is fine
    route('POST /gw/sessions', { body: { checkout_url: 'https://hosted.pay.example.com/c/1' } });
    assert.ok((await session()).clientConfig.checkoutUrl);
  });

  await check('checkout session: refusals', async () => {
    for (const address of [
      'https://evil.example.org/c/abc',
      'http://pay.example.com/c/abc',
      'https://127.0.0.1/c',
      'https://pay.example.com.evil.org/c',
      '',
    ]) {
      route('POST /gw/sessions', { body: { checkout_url: address } });
      await assert.rejects(session(), ValidationError, address);
    }
    route('POST /gw/sessions', { status: 400, body: {} });
    await assert.rejects(session(), ValidationError);
    route('POST /gw/sessions', { status: 503, body: {} });
    await assert.rejects(session(), /unavailable/);
    await assert.rejects(
      adapter.createCheckoutSession(ctx, {
        ...{
          idempotencyKey: 'k',
          amount: input.amount,
          invoiceId: 'i',
          companyId: 'c',
          threeDS: 'disabled' as const,
        },
        returnUrl: 'http://x',
      }),
      ValidationError,
    );
  });

  await check('charge and authorize verify the payment', async () => {
    route('GET /gw/payments/pay_123', { body: lookupBody() });
    for (const call of [adapter.charge, adapter.authorize]) {
      const result = await call?.(ctx, input);
      assert.equal(result?.status, 'captured');
      assert.equal(result?.amount.toDbString(), '120.5000');
      assert.equal(result?.processorTransactionId, 'pay_123');
      assert.equal(result?.cardIdentity, null);
    }
    assert.equal(seen[0]?.url, 'https://pay.example.com/gw/payments/pay_123');
    // custom paths and words
    const custom = ctxOf({
      lookupIdPath: 'data.payment.id',
      lookupStatusPath: 'data.state',
      lookupAmountPath: 'data.total_cents',
      lookupCurrencyPath: 'data.cur',
      lookupReferencePath: 'data.refs.0',
      amountFormat: 'minor_number',
      statusPaid: 'settled, done',
    });
    route('GET /gw/payments/pay_123', {
      body: {
        data: {
          payment: { id: 'pay_123' },
          state: 'Done',
          total_cents: 12050,
          cur: 'USD',
          refs: ['inv-uuid-1'],
        },
      },
    });
    assert.equal((await adapter.charge?.(custom, input))?.status, 'captured');
  });

  await check('verification: refusals', async () => {
    const cases: Array<[string, Json]> = [
      ['pending', lookupBody({ status: 'pending' })],
      ['failed', lookupBody({ status: 'failed' })],
      ['other amount', lookupBody({ amount: '99.00' })],
      ['other currency', lookupBody({ currency: 'EUR' })],
      ['other reference', lookupBody({ reference: 'inv-other' })],
      ['no reference', lookupBody({ reference: undefined })],
      ['no amount', lookupBody({ amount: undefined })],
      ['amount not a number', lookupBody({ amount: 'abc' })],
    ];
    for (const [name, body] of cases) {
      route('GET /gw/payments/pay_123', { body });
      assert.equal((await adapter.charge?.(ctx, input))?.status, 'declined', name);
    }
    route('GET /gw/payments/pay_123', { status: 404, body: {} });
    assert.equal((await adapter.charge?.(ctx, input))?.rawCode, 'PAYMENT_NOT_FOUND');
    await assert.rejects(
      adapter.charge?.(ctx, { ...input, paymentToken: 'a b' }) ?? Promise.resolve(),
      ValidationError,
    );
    route('GET /gw/payments/pay_123', { body: lookupBody() });
    await assert.rejects(
      adapter.charge?.(ctxOf({ lookupStatusPath: 'a..b' }), input) ?? Promise.resolve(),
      ValidationError,
    );
  });

  await check('refund: done, pending, refused, not configured', async () => {
    const request = {
      idempotencyKey: 'rk',
      processorTransactionId: 'pay_123',
      amount: Money.parse('20.00'),
      reason: 'dup',
    };
    route('GET /gw/payments/pay_123', { body: lookupBody() });
    route('POST /gw/payments/pay_123/refunds', { body: { status: 'refunded' } });
    const done = await adapter.refund?.(ctx, request);
    assert.equal(done?.status, 'refunded');
    assert.deepEqual(bodyOf(seen[1]), { reason: 'dup', amount: '20.00' });
    route('POST /gw/payments/pay_123/refunds', { body: { status: 'processing' } });
    assert.equal((await adapter.refund?.(ctx, request))?.status, 'pending');
    route('POST /gw/payments/pay_123/refunds', { body: { status: 'rejected' } });
    assert.equal((await adapter.refund?.(ctx, request))?.status, 'declined');
    route('POST /gw/payments/pay_123/refunds', { status: 400, body: {} });
    assert.equal((await adapter.refund?.(ctx, request))?.status, 'declined');
    assert.equal(
      (await adapter.refund?.(ctx, { ...request, amount: Money.parse('500.00') }))?.rawCode,
      'REFUND_AMOUNT_INVALID',
    );
    assert.equal(
      (await adapter.refund?.(ctxOf({ refundPath: '' }), request))?.rawCode,
      'REFUND_NOT_CONFIGURED',
    );
    route('GET /gw/payments/pay_123', { body: lookupBody({ status: 'refunded' }) });
    assert.equal((await adapter.refund?.(ctx, request))?.status, 'refunded');
    route('GET /gw/payments/pay_123', { body: lookupBody({ status: 'pending' }) });
    assert.equal((await adapter.refund?.(ctx, request))?.rawCode, 'PAYMENT_NOT_REFUNDABLE');
  });

  await check('lookup, paths and decline mapping', async () => {
    route('GET /gw/payments/pay_123', { body: lookupBody({ error_code: 'E42' }) });
    assert.equal((await adapter.getTransaction?.(ctx, 'pay_123'))?.status, 'captured');
    route('GET /gw/payments/pay_123', { status: 404, body: {} });
    await assert.rejects(
      adapter.getTransaction?.(ctx, 'pay_123') ?? Promise.resolve(),
      ValidationError,
    );
    assert.equal(at({ a: [{ b: 5 }] }, 'a.0.b'), 5);
    assert.equal(at({ a: [] }, 'a.0.b'), undefined);
    assert.equal(adapter.mapDecline({ code: 'x', message: null }), 'other');
  });

  await check('webhooks: signature formats', async () => {
    const raw = JSON.stringify({ id: 'e1', type: 'payment.succeeded', data: { id: 'pay_123' } });
    const hook = (
      c: AdapterContext,
      headers: Record<string, string>,
      body = raw,
    ): Promise<boolean> => adapter.verifyWebhook(c, { rawBody: body, headers });
    const name = 'x-gateway-signature';
    assert.equal(await hook(ctx, { [name]: sign(raw) }), true);
    assert.equal(await hook(ctx, { [name]: sign(raw).toUpperCase() }), true);
    assert.equal(await hook(ctx, { [name]: sign(raw, 'other-secret') }), false);
    assert.equal(await hook(ctx, { [name]: sign(raw) }, raw + ' '), false);
    assert.equal(await hook(ctx, {}), false);
    assert.equal(await hook(ctx, { [name]: '' }), false);
    assert.equal(await hook(ctx, { [name]: sign(raw) }, ''), false);
    assert.equal(await hook(ctxOf({ webhookSecret: '' }), { [name]: sign('x') }), false);
    assert.equal(await hook(ctxOf({ signatureHeader: '' }), { [name]: sign(raw) }), false);
    const base64 = ctxOf({ signatureFormat: 'hmac_sha256_base64' });
    assert.equal(await hook(base64, { [name]: sign(raw, undefined, 'base64') }), true);
    assert.equal(await hook(base64, { [name]: sign(raw) }), false);
    assert.equal(await hook(ctxOf({ signatureFormat: 'md5' }), { [name]: sign(raw) }), false);
    const stamped = ctxOf({ timestampHeader: 'X-Gateway-Time' });
    const ts = String(Date.now()).slice(0, -3);
    assert.equal(await hook(stamped, { [name]: sign(`${ts}.${raw}`), 'x-gateway-time': ts }), true);
    assert.equal(await hook(stamped, { [name]: sign(raw), 'x-gateway-time': ts }), false);
    assert.equal(await hook(stamped, { [name]: sign(`${ts}.${raw}`) }), false);
    const old = String(+ts - 3600);
    assert.equal(
      await hook(stamped, { [name]: sign(`${old}.${raw}`), 'x-gateway-time': old }),
      false,
    );
  });

  await check('webhooks: events', () => {
    const parse = (event: Json): ReturnType<typeof adapter.parseWebhook> =>
      adapter.parseWebhook({ rawBody: JSON.stringify(event), headers: {} });
    const paid = parse({ id: 'e1', type: 'payment.succeeded', data: { id: 'pay_123' } });
    assert.equal(paid.type, 'payment.captured');
    assert.equal(paid.eventId, 'e1');
    assert.equal(paid.processorTransactionId, 'pay_123');
    assert.equal(
      parse({ id: 'e', type: 'payment.failed', data: { id: 'p' } }).type,
      'payment.failed',
    );
    assert.equal(
      parse({ id: 'e', type: 'payment.refunded', data: { id: 'p' } }).type,
      'payment.refunded',
    );
    assert.equal(
      parse({ id: 'e', type: 'payment.canceled', data: { id: 'p' } }).type,
      'payment.voided',
    );
    assert.equal(parse({ id: 'e', type: 'something.else', data: { id: 'p' } }).type, 'unknown');
    const noId = parse({ type: 'payment.succeeded', data: { id: 'p' } });
    assert.match(noId.eventId, /^[0-9a-f]{40}$/);
  });

  process.stdout.write(`step12-custom: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
