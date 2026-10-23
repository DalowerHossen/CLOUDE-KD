// path: scripts/verify/step12-fastspring.ts
// Checks the FastSpring adapter against a local fake transport that answers with the response shapes of FastSpring's
// reference pages (docs/processors/fastspring.md). It does NOT replace the sandbox run listed in
// docs/processors/fastspring.verify.md.
// Run: npx tsx --conditions=react-server scripts/verify/step12-fastspring.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { adapter } from '@/lib/payment/adapters/fastspring';
import { jsonWithAmounts, amountSlot } from '@/lib/payment/adapters/fastspring/api';
import { cardIdentity, fromOrder, moneyOf } from '@/lib/payment/adapters/fastspring/mapping';
import { adapterProblems } from '@/lib/payment/capabilities';
import {
  setTransportForVerification,
  type HttpRequest,
  type HttpResponse,
} from '@/lib/payment/http-client';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, AuthorizeInput } from '@/types/contracts';

const ctx: AdapterContext = {
  credentials: {
    username: 'APIUSER-ABC',
    password: 'pass-word-123456',
    checkoutPath: 'mystore/main',
    checkoutUrl: 'https://mystore.onfastspring.com/main',
    productPath: 'invoice-payment',
    webhookSecret: 'whsec-0123456789',
  },
  environment: 'sandbox',
  mode: 'checkout_components',
  correlationId: 'c1',
};
const ORDER = 'aBCDE12fGH3iJkL4mNOpqr';
const input: AuthorizeInput = {
  idempotencyKey: 'a3c1f2d4-1111-4222-8333-444455556666:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'inv-uuid-1',
  companyId: 'co',
  paymentToken: ORDER,
  billing: { postalCode: null, country: null },
  payerIp: '203.0.113.5',
  returnUrl: 'https://app.example.com/pay/x',
  threeDS: 'disabled',
  metadata: {},
};

type Json = Record<string, unknown>;
type Reply = { status?: number; body: unknown; raw?: string };
const seen: HttpRequest[] = [];
let routes = new Map<string, Reply>();
const route = (key: string, reply: Reply): void => void routes.set(key, reply);
setTransportForVerification(async (request): Promise<HttpResponse> => {
  seen.push(request);
  const found = routes.get(`${request.method} ${new URL(request.url).pathname}`);
  if (!found)
    return {
      status: 400,
      text: JSON.stringify({ orders: [{ action: 'order.get', result: 'error', error: {} }] }),
      headers: {},
    };
  return {
    status: found.status ?? 200,
    text: found.raw ?? JSON.stringify(found.body),
    headers: {},
  };
});

const order = (over: Json = {}): Json => ({
  order: ORDER,
  id: ORDER,
  reference: 'ABC123456-7891-01112',
  completed: true,
  live: false,
  currency: 'USD',
  total: 120.5,
  subtotal: 120.5,
  tax: 0,
  payment: { type: 'creditcard', creditcard: 'visa', cardEnding: '4242' },
  ...over,
});
const bodyOf = (r: HttpRequest | undefined): Json => JSON.parse(r?.body ?? '{}') as Json;

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
    idempotencyKey: 'k',
    amount: input.amount,
    invoiceId: 'inv-uuid-1',
    companyId: 'co',
    returnUrl: input.returnUrl,
    threeDS: 'disabled',
  });
const sign = (raw: string, secret = 'whsec-0123456789'): string =>
  createHmac('sha256', secret).update(raw).digest('base64');
const hook = (raw: string, signature: string | undefined): Promise<boolean> =>
  adapter.verifyWebhook(ctx, {
    rawBody: raw,
    headers: signature === undefined ? {} : { 'x-fs-signature': signature },
  });

async function main(): Promise<void> {
  await check('contract: merchant of record, one-step sale', () => {
    assert.deepEqual(adapterProblems(adapter), []);
    assert.equal(adapter.capabilities.isMerchantOfRecord, true);
    assert.equal(adapter.capabilities.supportsAuthCapture, false);
    assert.equal(adapter.capture, undefined);
    assert.equal(adapter.voidAuthorization, undefined);
    assert.ok(adapter.charge);
    assert.deepEqual(adapter.capabilities.currencies, ['USD']);
    for (const field of adapter.credentialFields)
      assert.ok(new RegExp(field.pattern ?? '').test(ctx.credentials[field.key] ?? ''), field.key);
  });

  await check('amount numbers are bare and exact', () => {
    assert.equal(
      jsonWithAmounts({
        a: { b: amountSlot(Money.parse('120.50')) },
        c: [amountSlot(Money.parse('0.07'))],
      }),
      '{"a":{"b":120.50},"c":[0.07]}',
    );
    assert.equal(moneyOf(14.95)?.toDbString(), '14.9500');
    assert.equal(moneyOf(60)?.toDbString(), '60.0000');
    assert.equal(moneyOf(-1), null);
    assert.equal(moneyOf('1'), null);
  });

  await check('checkout session: exact request, public data only', async () => {
    route('POST /v2/checkouts/mystore/main/sessions', {
      status: 201,
      body: { id: 'OS123456789012345ABC', checkoutStatus: ['READY_FOR_CHECKOUT'] },
    });
    const result = await session();
    assert.deepEqual(result.clientConfig, {
      sessionId: 'OS123456789012345ABC',
      checkoutUrl: 'https://mystore.onfastspring.com/main',
      sdkUrl: 'https://cdn.onfastspring.com/checkout-sdk/latest/fastspring-sdk.js',
    });
    assert.ok(!JSON.stringify(result).includes('pass-word'));
    const request = seen[0];
    assert.equal(request?.url, 'https://api.fastspring.com/v2/checkouts/mystore/main/sessions');
    assert.equal(
      request?.headers.authorization,
      `Basic ${Buffer.from('APIUSER-ABC:pass-word-123456').toString('base64')}`,
    );
    assert.equal(
      request?.body,
      '{"live":false,"orderTags":{"invoice_id":"inv-uuid-1"},"cart":{"lineItems":[{"productPath":"invoice-payment","quantity":1,"customPrice":{"unitPrice":{"USD":120.50}}}]}}',
    );
    routes = new Map();
    route('POST /v2/checkouts/mystore/main/sessions', {
      status: 201,
      body: { id: 'OS123456789012345ABC', checkoutStatus: ['READY_FOR_CHECKOUT'] },
    });
    await session({ ...ctx, environment: 'live' });
    assert.equal(bodyOf(seen[1]).live, true);
  });

  await check('checkout session: refusals', async () => {
    route('POST /v2/checkouts/mystore/main/sessions', { status: 400, body: {} });
    await assert.rejects(session(), ValidationError);
    route('POST /v2/checkouts/mystore/main/sessions', {
      status: 201,
      body: { id: 'OS123456789012345ABC', checkoutStatus: ['PRODUCTS_REQUIRED'] },
    });
    await assert.rejects(session(), ValidationError);
    route('POST /v2/checkouts/mystore/main/sessions', { status: 201, body: {} });
    await assert.rejects(session(), ValidationError);
    for (const key of ['checkoutPath', 'checkoutUrl', 'productPath'])
      await assert.rejects(
        session({ ...ctx, credentials: { ...ctx.credentials, [key]: '' } }),
        ValidationError,
      );
    route('POST /v2/checkouts/mystore/main/sessions', { status: 401, body: {} });
    await assert.rejects(session(), /did not accept/);
    route('POST /v2/checkouts/mystore/main/sessions', { status: 503, body: {} });
    await assert.rejects(session(), /unavailable/);
  });

  await check('charge and authorize verify the order', async () => {
    route(`GET /orders/${ORDER}`, { body: order() });
    for (const call of [adapter.charge, adapter.authorize]) {
      const result = await call?.(ctx, input);
      assert.equal(result?.status, 'captured');
      assert.equal(result?.amount.toDbString(), '120.5000');
      assert.equal(result?.processorTransactionId, ORDER);
      assert.deepEqual(result?.cardIdentity, { type: 'fingerprint', value: 'visa|4242' });
    }
    assert.equal(seen[0]?.url, `https://api.fastspring.com/orders/${ORDER}`);
  });

  await check('verification: tax on top and array answers', async () => {
    route(`GET /orders/${ORDER}`, { body: order({ total: 129.14, tax: 8.64 }) });
    const taxed = await adapter.charge?.(ctx, input);
    assert.equal(taxed?.status, 'captured');
    assert.equal(taxed?.amount.toDbString(), '120.5000');
    route(`GET /orders/${ORDER}`, { body: [order()] });
    assert.equal((await adapter.charge?.(ctx, input))?.status, 'captured');
  });

  await check('verification: refusals', async () => {
    const cases: Array<[string, Json | null]> = [
      ['not completed', order({ completed: false })],
      ['live order in sandbox', order({ live: true })],
      ['other currency', order({ currency: 'EUR' })],
      ['other amount', order({ total: 99, subtotal: 99 })],
      ['unknown', null],
    ];
    for (const [name, body] of cases) {
      route(`GET /orders/${ORDER}`, body ? { body } : { status: 400, body: { orders: [] } });
      const result = await adapter.charge?.(ctx, input);
      assert.equal(result?.status, 'declined', name);
    }
    await assert.rejects(
      adapter.charge?.(ctx, { ...input, paymentToken: '../x' }) ?? Promise.resolve(),
      ValidationError,
    );
    route(`GET /orders/${ORDER}`, { body: order({ live: false }) });
    const live = await adapter.charge?.({ ...ctx, environment: 'live' }, input);
    assert.equal(live?.status, 'declined');
  });

  await check('refund: whole, partial, refusals', async () => {
    route(`GET /orders/${ORDER}`, { body: order() });
    route('POST /returns', {
      body: { returns: [{ return: 'RET12345678', completed: true, totalReturn: 120.5 }] },
    });
    const whole = await adapter.refund?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: ORDER,
      amount: Money.parse('120.50'),
      reason: 'duplicate',
    });
    assert.equal(whole?.status, 'refunded');
    assert.equal(whole?.processorTransactionId, 'RET12345678');
    assert.deepEqual(bodyOf(seen[1]), {
      returns: [
        {
          order: ORDER,
          reason: 'OTHER',
          note: 'duplicate',
          notification: 'NONE',
          refundType: 'FULL',
        },
      ],
    });
    seen.length = 0;
    route('POST /returns', {
      body: { returns: [{ return: 'RET12345679', completed: false, totalReturn: 20 }] },
    });
    const part = await adapter.refund?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: ORDER,
      amount: Money.parse('20.00'),
      reason: null,
    });
    assert.equal(part?.status, 'pending');
    assert.equal(
      seen[1]?.body,
      `{"returns":[{"order":"${ORDER}","reason":"OTHER","note":"Refund requested","notification":"NONE","refundType":"PARTIAL","items":[{"product":"invoice-payment","amount":20.00}]}]}`,
    );
    route('POST /returns', {
      status: 400,
      body: { returns: [{ action: 'return.create', result: 'error', error: { product: 'x' } }] },
    });
    const bad = await adapter.refund?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: ORDER,
      amount: Money.parse('20.00'),
      reason: null,
    });
    assert.equal(bad?.status, 'declined');
    const tooMuch = await adapter.refund?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: ORDER,
      amount: Money.parse('500.00'),
      reason: null,
    });
    assert.equal(tooMuch?.rawCode, 'REFUND_AMOUNT_INVALID');
    route(`GET /orders/${ORDER}`, { body: order({ completed: false }) });
    const early = await adapter.refund?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: ORDER,
      amount: Money.parse('20.00'),
      reason: null,
    });
    assert.equal(early?.rawCode, 'ORDER_NOT_REFUNDABLE');
  });

  await check('lookup, identity, decline mapping, connection test', async () => {
    route(`GET /orders/${ORDER}`, { body: order() });
    assert.equal((await adapter.getTransaction?.(ctx, ORDER))?.status, 'captured');
    await assert.rejects(
      adapter.getTransaction?.(ctx, 'bad id') ?? Promise.resolve(),
      ValidationError,
    );
    assert.equal(cardIdentity(order({ payment: { type: 'paypal' } })), null);
    assert.equal(fromOrder(order({ completed: false }), null).status, 'pending');
    assert.equal(adapter.mapDecline({ code: 'x', message: null }), 'other');
    assert.equal((await adapter.testConnection(ctx)).ok, true);
    route('GET /orders/kd-connection-check', { status: 401, body: {} });
    const refused = await adapter.testConnection(ctx);
    assert.equal(refused.ok, false);
    assert.ok(!refused.message.includes('pass-word'));
    route('GET /orders/kd-connection-check', { status: 503, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
  });

  await check('webhooks: signature', async () => {
    const raw = JSON.stringify({
      events: [{ id: 'e1', type: 'order.completed', data: { id: ORDER } }],
    });
    assert.equal(await hook(raw, sign(raw)), true);
    assert.equal(await hook(raw, ` ${sign(raw)} `), true);
    assert.equal(await hook(raw, sign(raw, 'other-secret')), false);
    assert.equal(await hook(raw + ' ', sign(raw)), false);
    assert.equal(await hook(raw, undefined), false);
    assert.equal(await hook(raw, ''), false);
    assert.equal(await hook('', sign('')), false);
    assert.equal(
      await adapter.verifyWebhook(
        { ...ctx, credentials: { ...ctx.credentials, webhookSecret: '' } },
        { rawBody: raw, headers: { 'x-fs-signature': sign(raw, '') } },
      ),
      false,
    );
  });

  await check('webhooks: events', () => {
    const wrap = (...events: Json[]): string => JSON.stringify({ events });
    const done = adapter.parseWebhook({
      rawBody: wrap({
        id: 'e1',
        type: 'order.completed',
        created: 1751898991060,
        data: { order: ORDER, id: ORDER },
      }),
      headers: {},
    });
    assert.equal(done.type, 'payment.captured');
    assert.equal(done.eventId, 'e1');
    assert.equal(done.processorTransactionId, ORDER);
    assert.equal(done.occurredAt, '2025-07-07T14:36:31.060Z');
    const failed = adapter.parseWebhook({
      rawBody: wrap({ id: 'e2', type: 'order.failed', data: { id: ORDER } }),
      headers: {},
    });
    assert.equal(failed.type, 'payment.failed');
    const refund = adapter.parseWebhook({
      rawBody: wrap({
        id: 'e3',
        type: 'return.created',
        data: { return: 'RET1', original: { order: ORDER } },
      }),
      headers: {},
    });
    assert.equal(refund.type, 'payment.refunded');
    assert.equal(refund.processorTransactionId, ORDER);
    const dispute = adapter.parseWebhook({
      rawBody: wrap({
        id: 'e4',
        type: 'chargeback.created',
        data: { order: ORDER, reasonDescription: 'FRAUDULENT' },
      }),
      headers: {},
    });
    assert.equal(dispute.type, 'dispute.opened');
    const mixed = adapter.parseWebhook({
      rawBody: wrap(
        { id: 'e5', type: 'mailingListEntry.updated', data: {} },
        { id: 'e6', type: 'order.completed', data: { id: ORDER } },
      ),
      headers: {},
    });
    assert.equal(mixed.eventId, 'e6');
    const other = adapter.parseWebhook({
      rawBody: wrap({ id: 'e7', type: 'order.payment.pending', data: { id: ORDER } }),
      headers: {},
    });
    assert.equal(other.type, 'unknown');
  });

  process.stdout.write(`step12-fastspring: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
