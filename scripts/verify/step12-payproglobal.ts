// path: scripts/verify/step12-payproglobal.ts
// Checks the PayPro Global adapter against a local fake transport that answers with the response shapes of PayPro
// Global's reference pages (docs/processors/payproglobal.md). It does NOT replace the sandbox run listed in
// docs/processors/payproglobal.verify.md.
// Run: npx tsx --conditions=react-server scripts/verify/step12-payproglobal.ts
import assert from 'node:assert/strict';
import { createDecipheriv, createHash } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { adapter } from '@/lib/payment/adapters/payproglobal';
import { jsonWithAmounts, amountSlot } from '@/lib/payment/adapters/payproglobal/api';
import { customField, fromOrder, moneyOf } from '@/lib/payment/adapters/payproglobal/mapping';
import { adapterProblems } from '@/lib/payment/capabilities';
import {
  setTransportForVerification,
  type HttpRequest,
  type HttpResponse,
} from '@/lib/payment/http-client';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, AuthorizeInput } from '@/types/contracts';

const KEY = 'abcdefghijklmnopabcdefghijklmnop';
const IV = 'abcdefghijklmnop';
const ctx: AdapterContext = {
  credentials: {
    vendorAccountId: '123456',
    apiSecretKey: 'api-secret-key-123',
    validationKey: 'qwerty',
    productId: '12345',
    encryptionKey: KEY,
    encryptionIv: IV,
    testSecretKey: 'test-secret',
  },
  environment: 'sandbox',
  mode: 'hosted_checkout',
  correlationId: 'c1',
};
const input: AuthorizeInput = {
  idempotencyKey: 'a3c1f2d4-1111-4222-8333-444455556666:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'inv-uuid-1',
  companyId: 'co',
  paymentToken: '12345678',
  billing: { postalCode: null, country: null },
  payerIp: '203.0.113.5',
  returnUrl: 'https://app.example.com/pay/x',
  threeDS: 'disabled',
  metadata: {},
};

type Json = Record<string, unknown>;
type Reply = { status?: number; body: unknown };
const seen: HttpRequest[] = [];
let routes = new Map<string, Reply>();
const route = (path: string, reply: Reply): void => void routes.set(path, reply);
setTransportForVerification(async (request): Promise<HttpResponse> => {
  seen.push(request);
  const found = routes.get(new URL(request.url).pathname);
  const reply = found ?? { body: { response: null, errors: [], isSuccess: false } };
  return { status: reply.status ?? 200, text: JSON.stringify(reply.body), headers: {} };
});

const details = (over: Json = {}): Json => ({
  orderId: 12345678,
  orderStatusId: 5,
  orderStatusName: 'Processed',
  paymentMethodName: 'Visa',
  billingCurrencyCode: 'USD',
  customFields: { 'x-KdInvoice': 'inv-uuid-1' },
  orderItems: [{ orderItemId: 87654321, productId: 12345, billingPrice: 120.5 }],
  billingRefundedAmount: 0,
  creditCardLast4: '1798',
  creditCardExpirationDate: '04/29',
  isTestMode: true,
  billingTotalPrice: 120.5,
  billingTotalTaxes: 0,
  ...over,
});
const answer = (response: unknown, ok = true): Reply => ({
  body: { response, errors: [], isSuccess: ok },
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
const sign = (form: Record<string, string>, key = 'qwerty'): string =>
  createHash('sha256')
    .update(
      `${form.ORDER_ID}${form.ORDER_STATUS}${form.ORDER_TOTAL_AMOUNT}${form.CUSTOMER_EMAIL}${key}${form.TEST_MODE}${form.IPN_TYPE_NAME}`,
    )
    .digest('hex');
const ipn = (over: Record<string, string> = {}, key = 'qwerty'): string => {
  const form: Record<string, string> = {
    IPN_TYPE_ID: '1',
    IPN_TYPE_NAME: 'OrderCharged',
    ORDER_ID: '12345',
    ORDER_STATUS: 'Processed',
    ORDER_TOTAL_AMOUNT: '9.99',
    CUSTOMER_EMAIL: 'test@payproglobal.com',
    TEST_MODE: '1',
    ORDER_ITEM_ID: '99',
    ...over,
  };
  return new URLSearchParams({ ...form, SIGNATURE: sign(form, key) }).toString();
};
const hook = (raw: string): Promise<boolean> =>
  adapter.verifyWebhook(ctx, { rawBody: raw, headers: {} });

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
      if (field.required)
        assert.ok(
          new RegExp(field.pattern ?? '').test(ctx.credentials[field.key] ?? ''),
          field.key,
        );
  });

  await check('amount numbers are bare and exact', () => {
    assert.equal(
      jsonWithAmounts({
        a: amountSlot(Money.parse('20.00')),
        b: [amountSlot(Money.parse('0.07'))],
      }),
      '{"a":20.00,"b":[0.07]}',
    );
    assert.equal(moneyOf(14.95)?.toDbString(), '14.9500');
    assert.equal(moneyOf(-1), null);
  });

  await check('checkout link: encrypted dynamic settings, public data only', async () => {
    const result = await session();
    const url = new URL(result.clientConfig.checkoutUrl ?? '');
    assert.equal(url.origin + url.pathname, 'https://store.payproglobal.com/checkout');
    assert.equal(url.searchParams.get('products[1][id]'), '12345');
    assert.equal(url.searchParams.get('currency'), 'USD');
    assert.equal(url.searchParams.get('use-test-mode'), 'true');
    assert.equal(url.searchParams.get('secret-key'), 'test-secret');
    const data = (url.searchParams.get('products[1][data]') ?? '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const decipher = createDecipheriv(
      'aes-256-cbc',
      Buffer.from(KEY, 'ascii'),
      Buffer.from(IV, 'ascii'),
    );
    const plain = Buffer.concat([
      decipher.update(Buffer.from(data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    const fields = new URLSearchParams(plain.replace(/\[/g, '%5B').replace(/\]/g, '%5D'));
    assert.equal(fields.get('x-KdInvoice'), 'inv-uuid-1');
    assert.equal(fields.get('Name'), 'Invoice payment');
    assert.equal(fields.get('Price[USD][Amount]'), '120.50');
    assert.match(fields.get('LinkExpiration') ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    assert.equal(seen.length, 0);
    assert.ok(!JSON.stringify(result).includes('api-secret'));
    assert.ok(!JSON.stringify(result).includes(KEY));
    const live = await session({ ...ctx, environment: 'live' });
    const liveUrl = new URL(live.clientConfig.checkoutUrl ?? '');
    assert.equal(liveUrl.searchParams.get('use-test-mode'), null);
    assert.equal(liveUrl.searchParams.get('secret-key'), null);
  });

  await check('checkout link: refusals', async () => {
    for (const key of ['productId'])
      await assert.rejects(
        session({ ...ctx, credentials: { ...ctx.credentials, [key]: '' } }),
        ValidationError,
      );
    await assert.rejects(
      session({ ...ctx, credentials: { ...ctx.credentials, encryptionKey: 'short' } }),
      ValidationError,
    );
    await assert.rejects(
      adapter.createCheckoutSession(ctx, {
        idempotencyKey: 'k',
        amount: input.amount,
        invoiceId: 'bad id&x=1',
        companyId: 'co',
        returnUrl: input.returnUrl,
        threeDS: 'disabled',
      }),
      ValidationError,
    );
  });

  await check('charge and authorize verify the order', async () => {
    route('/api/Orders/GetOrderDetails', answer(details()));
    for (const call of [adapter.charge, adapter.authorize]) {
      const result = await call?.(ctx, input);
      assert.equal(result?.status, 'captured');
      assert.equal(result?.amount.toDbString(), '120.5000');
      assert.equal(result?.processorTransactionId, '12345678');
      assert.deepEqual(result?.cardIdentity, { type: 'fingerprint', value: 'Visa|1798|04/29' });
    }
    assert.deepEqual(bodyOf(seen[0]), {
      orderId: 12345678,
      dateFormat: 'a',
      vendorAccountId: 123456,
      apiSecretKey: 'api-secret-key-123',
    });
    assert.equal(seen[0]?.url, 'https://store.payproglobal.com/api/Orders/GetOrderDetails');
  });

  await check('verification: tax variants and custom field keys', async () => {
    route(
      '/api/Orders/GetOrderDetails',
      answer(details({ billingTotalPrice: 100.5, billingTotalTaxes: 20 })),
    );
    assert.equal((await adapter.charge?.(ctx, input))?.status, 'captured');
    route(
      '/api/Orders/GetOrderDetails',
      answer(details({ customFields: { kdinvoice: 'inv-uuid-1' } })),
    );
    assert.equal((await adapter.charge?.(ctx, input))?.status, 'captured');
    route(
      '/api/Orders/GetOrderDetails',
      answer(details({ customFields: [{ key: 'x-KdInvoice', value: 'inv-uuid-1' }] })),
    );
    assert.equal((await adapter.charge?.(ctx, input))?.status, 'captured');
    assert.equal(customField(details({ customFields: [] }), 'KdInvoice'), null);
  });

  await check('verification: refusals', async () => {
    const cases: Array<[string, Json | null]> = [
      ['waiting', details({ orderStatusId: 1 })],
      ['canceled', details({ orderStatusId: 2 })],
      ['live order in the sandbox', details({ isTestMode: false })],
      ['other currency', details({ billingCurrencyCode: 'EUR' })],
      ['other amount', details({ billingTotalPrice: 99, billingTotalTaxes: 0 })],
      ['other invoice', details({ customFields: { 'x-KdInvoice': 'inv-other' } })],
      ['no invoice', details({ customFields: {} })],
      ['unknown', null],
    ];
    for (const [name, response] of cases) {
      route('/api/Orders/GetOrderDetails', response ? answer(response) : answer(null, false));
      assert.equal((await adapter.charge?.(ctx, input))?.status, 'declined', name);
    }
    await assert.rejects(
      adapter.charge?.(ctx, { ...input, paymentToken: '12 34' }) ?? Promise.resolve(),
      ValidationError,
    );
    route('/api/Orders/GetOrderDetails', answer(details({ isTestMode: true })));
    assert.equal(
      (await adapter.charge?.({ ...ctx, environment: 'live' }, input))?.status,
      'declined',
    );
    route('/api/Orders/GetOrderDetails', { status: 403, body: {} });
    await assert.rejects(adapter.charge?.(ctx, input) ?? Promise.resolve(), /whitelisted/);
    route('/api/Orders/GetOrderDetails', { status: 503, body: {} });
    await assert.rejects(adapter.charge?.(ctx, input) ?? Promise.resolve(), /unavailable/);
  });

  await check('refund: whole, partial, refusals', async () => {
    route('/api/Orders/GetOrderDetails', answer(details()));
    route(
      '/api/Orders/DoRefund',
      answer([{ orderId: 12345678, isRefundSuccessful: true, refundNotice: null }]),
    );
    const whole = await adapter.refund?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: '12345678',
      amount: Money.parse('120.50'),
      reason: 'duplicate',
    });
    assert.equal(whole?.status, 'refunded');
    assert.deepEqual(bodyOf(seen[1]), {
      orderIds: [12345678],
      refundReason: 'duplicate',
      vendorAccountId: 123456,
      apiSecretKey: 'api-secret-key-123',
    });
    seen.length = 0;
    route(
      '/api/Orders/DoPartialRefund',
      answer({ orderItemId: 87654321, isRefundSuccessful: true }),
    );
    const part = await adapter.refund?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: '12345678',
      amount: Money.parse('20.00'),
      reason: null,
    });
    assert.equal(part?.status, 'refunded');
    assert.ok(
      seen[1]?.body?.includes(
        '"orderItemId":87654321,"refundAmount":20.00,"changeSubscriptionPrice":false',
      ),
    );
    route(
      '/api/Orders/DoPartialRefund',
      answer({ orderItemId: 87654321, isRefundSuccessful: false, refundNotice: 'x' }),
    );
    const bad = await adapter.refund?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: '12345678',
      amount: Money.parse('20.00'),
      reason: null,
    });
    assert.equal(bad?.status, 'declined');
    const tooMuch = await adapter.refund?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: '12345678',
      amount: Money.parse('500.00'),
      reason: null,
    });
    assert.equal(tooMuch?.rawCode, 'REFUND_AMOUNT_INVALID');
    route('/api/Orders/GetOrderDetails', answer(details({ billingRefundedAmount: 20 })));
    seen.length = 0;
    await adapter.refund?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: '12345678',
      amount: Money.parse('100.50'),
      reason: null,
    });
    assert.ok(seen[1]?.url.endsWith('/DoPartialRefund'));
    route('/api/Orders/GetOrderDetails', answer(details({ orderStatusId: 3 })));
    const again = await adapter.refund?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: '12345678',
      amount: Money.parse('120.50'),
      reason: null,
    });
    assert.equal(again?.status, 'refunded');
    route('/api/Orders/GetOrderDetails', answer(details({ orderStatusId: 1 })));
    const early = await adapter.refund?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: '12345678',
      amount: Money.parse('20.00'),
      reason: null,
    });
    assert.equal(early?.rawCode, 'ORDER_NOT_REFUNDABLE');
  });

  await check('lookup, states, decline mapping, connection test', async () => {
    route('/api/Orders/GetOrderDetails', answer(details()));
    assert.equal((await adapter.getTransaction?.(ctx, '12345678'))?.status, 'captured');
    await assert.rejects(adapter.getTransaction?.(ctx, 'x') ?? Promise.resolve(), ValidationError);
    assert.equal(fromOrder(details({ orderStatusId: 4 }), null).rawCode, 'CHARGEBACK');
    assert.equal(fromOrder(details({ creditCardLast4: null }), null).cardIdentity, null);
    assert.equal(adapter.mapDecline({ code: 'x', message: null }), 'other');
    route('/api/Orders/GetList', answer({ skip: 0, take: 1, totalCount: 0, orders: [] }));
    assert.equal((await adapter.testConnection(ctx)).ok, true);
    route('/api/Orders/GetList', { status: 401, body: {} });
    const refused = await adapter.testConnection(ctx);
    assert.equal(refused.ok, false);
    assert.ok(!refused.message.includes('api-secret'));
    route('/api/Orders/GetList', answer(null, false));
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    assert.equal(
      (
        await adapter.testConnection({
          ...ctx,
          credentials: { ...ctx.credentials, apiSecretKey: '' },
        })
      ).ok,
      false,
    );
  });

  await check('webhooks: signature', async () => {
    assert.equal(await hook(ipn()), true);
    assert.equal(await hook(ipn({}, 'other-key')), false);
    const raw = ipn();
    assert.equal(await hook(raw.replace('9.99', '0.01')), false);
    assert.equal(await hook(raw.replace('SIGNATURE=', 'SIGNATURE=0')), false);
    assert.equal(await hook(raw.replace(/SIGNATURE=[0-9a-f]+/, '')), false);
    assert.equal(await hook(raw.replace('TEST_MODE=1', 'TEST_MODE=0')), false);
    assert.equal(await hook(''), false);
    assert.equal(
      await adapter.verifyWebhook(
        { ...ctx, credentials: { ...ctx.credentials, validationKey: '' } },
        { rawBody: raw, headers: {} },
      ),
      false,
    );
    const upper = raw.replace(
      /SIGNATURE=([0-9a-f]+)/,
      (_m, hex: string) => `SIGNATURE=${hex.toUpperCase()}`,
    );
    assert.equal(await hook(upper), true);
  });

  await check('webhooks: events', () => {
    const parse = (over: Record<string, string>): ReturnType<typeof adapter.parseWebhook> =>
      adapter.parseWebhook({ rawBody: ipn(over), headers: {} });
    const charged = parse({});
    assert.equal(charged.type, 'payment.captured');
    assert.equal(charged.processorTransactionId, '12345');
    assert.equal(charged.eventId, '1:12345:99:');
    assert.equal(parse({ IPN_TYPE_NAME: 'OrderDeclined' }).type, 'payment.failed');
    const refund = parse({
      IPN_TYPE_NAME: 'OrderPartiallyRefunded',
      IPN_TYPE_ID: '5',
      ORDER_REFUNDED: '20.00',
    });
    assert.equal(refund.type, 'payment.refunded');
    assert.equal(refund.eventId, '5:12345:99:20.00');
    assert.equal(parse({ IPN_TYPE_NAME: 'OrderRefunded' }).type, 'payment.refunded');
    assert.equal(parse({ IPN_TYPE_NAME: 'OrderChargedBack' }).type, 'dispute.opened');
    assert.equal(parse({ IPN_TYPE_NAME: 'OrderChargedBackWon' }).type, 'dispute.closed');
    assert.equal(parse({ IPN_TYPE_NAME: 'OrderOnWaiting' }).type, 'unknown');
    assert.equal(parse({ ORDER_ID: 'abc' }).processorTransactionId, null);
  });

  process.stdout.write(`step12-payproglobal: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
