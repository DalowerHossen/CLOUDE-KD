// path: scripts/verify/step11-paypal.ts
// Checks the PayPal adapter against a local fake transport that answers with the response shapes of PayPal's OpenAPI
// specifications and documentation (docs/processors/paypal.md). It does NOT replace the sandbox run listed in
// docs/processors/paypal.verify.md. Run: npx tsx --conditions=react-server scripts/verify/step11-paypal.ts
import assert from 'node:assert/strict';
import { adapter, paypalValue } from '@/lib/payment/adapters/paypal';
import { clearTokenCache } from '@/lib/payment/adapters/paypal/api';
import { avsPostal, readAuthentication } from '@/lib/payment/adapters/paypal/mapping';
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
    clientId: 'AbCdEfGhIjKlMnOpQrStUvWx-test',
    clientSecret: 'EXxyz0123456789abcdefghijklmnop',
    webhookId: '0NH55953DH663215D',
  },
  environment: 'sandbox',
  mode: 'default',
  correlationId: 'c1',
};
const INVOICE = 'inv-uuid-1';
const input: AuthorizeInput = {
  idempotencyKey: 'pay_1:authorize',
  amount: Money.parse('120.50'),
  invoiceId: INVOICE,
  companyId: 'co',
  paymentToken: '5O190127TN364715T',
  billing: { postalCode: '10001', country: 'US' },
  payerIp: '203.0.113.5',
  returnUrl: 'https://app.example.com/pay/x',
  threeDS: 'preferred',
  metadata: {},
};

type Reply = { status: number; body: unknown };
const seen: HttpRequest[] = [];
let routes = new Map<string, Reply | ((r: HttpRequest) => Reply)>();
const route = (key: string, reply: Reply | ((r: HttpRequest) => Reply)): void =>
  void routes.set(key, reply);
setTransportForVerification(async (request): Promise<HttpResponse> => {
  seen.push(request);
  const u = new URL(request.url);
  const found = routes.get(`${request.method} ${u.pathname}`);
  if (!found)
    return { status: 404, text: JSON.stringify({ name: 'RESOURCE_NOT_FOUND' }), headers: {} };
  const reply = typeof found === 'function' ? found(request) : found;
  return { status: reply.status, text: JSON.stringify(reply.body), headers: {} };
});

const card = (auth?: Record<string, unknown>): Record<string, unknown> => ({
  last_digits: '1881',
  brand: 'VISA',
  from_request: { expiry: '2030-12', last_digits: '1881' },
  bin_details: { bin: '40128888' },
  ...(auth ? { authentication_result: auth } : {}),
});
const goodAuth = {
  liability_shift: 'POSSIBLE',
  three_d_secure: { enrollment_status: 'Y', authentication_status: 'Y' },
};
const order = (
  over: Record<string, unknown> = {},
  unit: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: '5O190127TN364715T',
  status: 'APPROVED',
  intent: 'AUTHORIZE',
  payment_source: { card: card(goodAuth) },
  purchase_units: [
    { custom_id: INVOICE, amount: { currency_code: 'USD', value: '120.50' }, ...unit },
  ],
  ...over,
});
const withAuth = (
  status: string,
  response: Record<string, unknown> = { avs_code: 'Y', response_code: '0000' },
): Record<string, unknown> =>
  order(
    { status: 'COMPLETED' },
    { payments: { authorizations: [{ id: 'AUTH1234567', status, processor_response: response }] } },
  );

function setup(): void {
  routes = new Map();
  seen.length = 0;
  clearTokenCache();
  route('POST /v1/oauth2/token', {
    status: 200,
    body: { access_token: 'A21AAtesttoken', expires_in: 32000 },
  });
}
let checks = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  setup();
  try {
    await fn();
    checks += 1;
  } catch (e) {
    process.stderr.write(`FAIL ${name}\n`);
    throw e;
  }
}
const calls = (): string => seen.map((r) => `${r.method} ${new URL(r.url).pathname}`).join(' | ');

async function main(): Promise<void> {
  await check('contract is complete', () => {
    assert.deepEqual(adapterProblems(adapter), []);
    assert.deepEqual(
      adapter.credentialFields.map((f) => [f.key, f.secret]),
      [
        ['clientId', false],
        ['clientSecret', true],
        ['webhookId', false],
      ],
    );
  });

  await check('value formatting', () => {
    assert.equal(paypalValue(Money.parse('120.5')), '120.50');
    assert.equal(paypalValue(Money.parse('0.07')), '0.07');
    assert.equal(paypalValue(Money.parse('1000')), '1000.00');
  });

  await check(
    'checkout session: order created server side, token requests as documented',
    async () => {
      route('POST /v2/checkout/orders', (r) => {
        const body = JSON.parse(r.body ?? '{}') as Record<string, unknown>;
        assert.equal(body.intent, 'AUTHORIZE');
        return { status: 201, body: { id: '5O190127TN364715T', status: 'PAYER_ACTION_REQUIRED' } };
      });
      const session = await adapter.createCheckoutSession(ctx, {
        idempotencyKey: 'link:session:1',
        amount: Money.parse('120.50'),
        invoiceId: INVOICE,
        companyId: 'co',
        returnUrl: 'https://app.example.com/pay/x',
        threeDS: 'preferred',
      });
      assert.deepEqual(session.clientConfig, {
        clientToken: 'A21AAtesttoken',
        orderId: '5O190127TN364715T',
        sdkUrl: 'https://www.sandbox.paypal.com/web-sdk/v6/core',
        environment: 'sandbox',
      });
      assert.ok(session.expiresAt);
      const tokenCalls = seen.filter((r) => r.url.endsWith('/v1/oauth2/token'));
      assert.equal(tokenCalls.length, 2, 'server token and browser token');
      assert.equal(
        tokenCalls[0]?.headers.authorization,
        `Basic ${Buffer.from(`${ctx.credentials.clientId}:${ctx.credentials.clientSecret}`).toString('base64')}`,
      );
      assert.equal(tokenCalls[0]?.body, 'grant_type=client_credentials&response_type=token');
      assert.equal(
        tokenCalls[1]?.body,
        'grant_type=client_credentials&response_type=client_token&intent=sdk_init',
      );
      const create = seen.find((r) => r.url.endsWith('/v2/checkout/orders'));
      assert.equal(create?.url, 'https://api-m.sandbox.paypal.com/v2/checkout/orders');
      assert.equal(create?.headers['paypal-request-id'], 'link:session:1');
      assert.equal(create?.headers.authorization, 'Bearer A21AAtesttoken');
      const body = JSON.parse(create?.body ?? '{}') as {
        purchase_units: { custom_id: string; amount: unknown }[];
        payment_source: {
          card: {
            attributes: { verification: { method: string } };
            experience_context: Record<string, string>;
          };
        };
      };
      assert.deepEqual(body.purchase_units[0]?.amount, { currency_code: 'USD', value: '120.50' });
      assert.equal(body.purchase_units[0]?.custom_id, INVOICE);
      assert.equal(body.payment_source.card.attributes.verification.method, 'SCA_ALWAYS');
      assert.equal(
        body.payment_source.card.experience_context.return_url,
        'https://app.example.com/pay/x',
      );
      assert.ok(!JSON.stringify(session).includes(ctx.credentials.clientSecret ?? 'x'));
      seen.length = 0;
      await adapter.createCheckoutSession(
        { ...ctx, environment: 'live' },
        {
          idempotencyKey: 'k2',
          amount: Money.parse('5'),
          invoiceId: INVOICE,
          companyId: 'co',
          returnUrl: 'https://app.example.com/x',
          threeDS: 'disabled',
        },
      );
      assert.ok(seen.every((r) => r.url.startsWith('https://api-m.paypal.com/')));
      const live = JSON.parse(
        seen.find((r) => r.url.endsWith('/v2/checkout/orders'))?.body ?? '{}',
      ) as { payment_source: { card: { attributes: { verification: { method: string } } } } };
      assert.equal(live.payment_source.card.attributes.verification.method, 'SCA_WHEN_REQUIRED');
    },
  );

  await check('authorize: verify the order, then authorize, map result', async () => {
    route('GET /v2/checkout/orders/5O190127TN364715T', { status: 200, body: order() });
    route('POST /v2/checkout/orders/5O190127TN364715T/authorize', {
      status: 201,
      body: withAuth('CREATED'),
    });
    const tx = await adapter.authorize(ctx, input);
    assert.equal(
      calls(),
      'POST /v1/oauth2/token | GET /v2/checkout/orders/5O190127TN364715T | POST /v2/checkout/orders/5O190127TN364715T/authorize',
    );
    assert.equal(seen[2]?.headers['paypal-request-id'], 'pay_1:authorize');
    assert.equal(tx.status, 'authorized');
    assert.equal(tx.processorTransactionId, '5O190127TN364715T');
    assert.equal(tx.amount.toDbString(), '120.5000');
    assert.deepEqual(tx.cardIdentity, { type: 'fingerprint', value: '40128888|1881|2030-12|VISA' });
    assert.equal(tx.avsPostalCodeMatch, true);
    assert.deepEqual(
      [
        tx.threeDS.requested,
        tx.threeDS.completed,
        tx.threeDS.authenticated,
        tx.threeDS.liabilityShift,
      ],
      [true, true, true, true],
    );
    // the token is cached: a second call needs no new token
    seen.length = 0;
    await adapter.getTransaction(ctx, '5O190127TN364715T');
    assert.ok(!seen.some((r) => r.url.endsWith('/v1/oauth2/token')));
  });

  await check('3DS table: PayPal recommended action', async () => {
    const read = (liability: string, enrollment: string | null, status: string | null): boolean =>
      readAuthentication(
        card({
          liability_shift: liability,
          three_d_secure: {
            ...(enrollment ? { enrollment_status: enrollment } : {}),
            ...(status ? { authentication_status: status } : {}),
          },
        }),
        true,
      ).mayContinue;
    assert.equal(read('POSSIBLE', 'Y', 'Y'), true);
    assert.equal(read('POSSIBLE', 'Y', 'A'), true);
    assert.equal(read('NO', 'Y', 'N'), false);
    assert.equal(read('NO', 'Y', 'R'), false);
    assert.equal(read('UNKNOWN', 'Y', 'U'), false);
    assert.equal(read('NO', 'Y', 'U'), false);
    assert.equal(read('UNKNOWN', 'Y', 'C'), false);
    assert.equal(read('NO', 'Y', null), false);
    assert.equal(read('NO', 'N', null), true);
    assert.equal(read('NO', 'U', null), true);
    assert.equal(read('UNKNOWN', 'U', null), false);
    assert.equal(read('NO', 'B', null), true);
    assert.equal(readAuthentication(card(), true).mayContinue, true, 'no 3DS data: continue');
    const attempted = readAuthentication(
      card({
        liability_shift: 'POSSIBLE',
        three_d_secure: { enrollment_status: 'Y', authentication_status: 'A' },
      }),
      true,
    );
    assert.deepEqual(
      [attempted.result.authenticated, attempted.result.liabilityShift],
      [false, true],
      'attempted is not authenticated',
    );
  });

  await check('authorize does not call PayPal when authentication says stop', async () => {
    const bad = order({
      payment_source: {
        card: card({
          liability_shift: 'NO',
          three_d_secure: { enrollment_status: 'Y', authentication_status: 'N' },
        }),
      },
    });
    route('GET /v2/checkout/orders/5O190127TN364715T', { status: 200, body: bad });
    const tx = await adapter.authorize(ctx, input);
    assert.equal(tx.status, 'declined');
    assert.equal(tx.declineCategory, 'three_ds_failed');
    assert.deepEqual(tx.cardIdentity, { type: 'fingerprint', value: '40128888|1881|2030-12|VISA' });
    assert.ok(!calls().includes('/authorize'));
    const noAuth = order({ payment_source: { card: card() } });
    route('GET /v2/checkout/orders/5O190127TN364715T', { status: 200, body: noAuth });
    route('POST /v2/checkout/orders/5O190127TN364715T/authorize', {
      status: 201,
      body: { ...withAuth('CREATED', { avs_code: 'N' }), payment_source: { card: card() } },
    });
    const plain = await adapter.authorize(ctx, input);
    assert.equal(plain.status, 'authorized');
    assert.equal(plain.threeDS.authenticated, false);
    assert.equal(plain.avsPostalCodeMatch, false);
  });

  await check('authorize refuses an order that is not the one the server made', async () => {
    const cases: [string, Record<string, unknown>][] = [
      ['amount', order({}, { amount: { currency_code: 'USD', value: '1.00' } })],
      ['currency', order({}, { amount: { currency_code: 'EUR', value: '120.50' } })],
      ['invoice', order({}, { custom_id: 'another-invoice' })],
      ['not approved', order({ status: 'CREATED' })],
    ];
    for (const [name, body] of cases) {
      seen.length = 0;
      route('GET /v2/checkout/orders/5O190127TN364715T', { status: 200, body });
      const tx = await adapter.authorize(ctx, input);
      assert.equal(tx.status, 'declined', name);
      assert.ok(!calls().includes('/authorize'), name);
    }
    seen.length = 0;
    route('GET /v2/checkout/orders/5O190127TN364715T', {
      status: 404,
      body: { name: 'RESOURCE_NOT_FOUND' },
    });
    assert.equal((await adapter.authorize(ctx, input)).status, 'declined');
    await assert.rejects(
      () => adapter.authorize(ctx, { ...input, paymentToken: '../../v1/x' }),
      /order id/,
    );
  });

  await check('declines by processor response code', async () => {
    const table: [string, string][] = [
      ['5120', 'insufficient_funds'],
      ['5400', 'invalid_expiry'],
      ['5180', 'invalid_number'],
      ['1330', 'invalid_number'],
      ['00N7', 'invalid_cvv'],
      ['5110', 'invalid_cvv'],
      ['0500', 'do_not_honor'],
      ['5100', 'do_not_honor'],
      ['9500', 'processor_fraud_signal'],
      ['9520', 'processor_fraud_signal'],
      ['5650', 'three_ds_failed'],
      ['8000', 'processor_error'],
      ['5170', 'other'],
      ['ZZZZ', 'other'],
    ];
    route('GET /v2/checkout/orders/5O190127TN364715T', { status: 200, body: order() });
    for (const [code, category] of table) {
      route('POST /v2/checkout/orders/5O190127TN364715T/authorize', {
        status: 201,
        body: withAuth('DENIED', { avs_code: 'G', cvv_code: 'P', response_code: code }),
      });
      const tx = await adapter.authorize(ctx, input);
      assert.equal(tx.status, 'declined', code);
      assert.equal(tx.declineCategory, category, code);
      assert.equal(tx.rawCode, code);
      assert.ok(tx.cardIdentity, 'identity is kept on a decline');
    }
  });

  await check('authorize errors: 422 issues and a repeated authorize', async () => {
    route('GET /v2/checkout/orders/5O190127TN364715T', { status: 200, body: order() });
    route('POST /v2/checkout/orders/5O190127TN364715T/authorize', {
      status: 422,
      body: {
        name: 'UNPROCESSABLE_ENTITY',
        details: [{ issue: 'INSTRUMENT_DECLINED', description: 'declined' }],
      },
    });
    const declined = await adapter.authorize(ctx, input);
    assert.deepEqual(
      [declined.status, declined.declineCategory, declined.rawCode],
      ['declined', 'do_not_honor', 'INSTRUMENT_DECLINED'],
    );
    route('POST /v2/checkout/orders/5O190127TN364715T/authorize', {
      status: 422,
      body: { details: [{ issue: 'CARD_EXPIRED' }] },
    });
    assert.equal((await adapter.authorize(ctx, input)).declineCategory, 'invalid_expiry');
    let getCount = 0;
    route('GET /v2/checkout/orders/5O190127TN364715T', () => {
      getCount += 1;
      return { status: 200, body: getCount === 1 ? order() : withAuth('CREATED') };
    });
    route('POST /v2/checkout/orders/5O190127TN364715T/authorize', {
      status: 422,
      body: { details: [{ issue: 'ORDER_ALREADY_AUTHORIZED' }] },
    });
    assert.equal(
      (await adapter.authorize(ctx, input)).status,
      'authorized',
      'an authorization that already exists is returned',
    );
    route('GET /v2/checkout/orders/5O190127TN364715T', { status: 200, body: withAuth('CREATED') });
    assert.equal(
      (await adapter.authorize(ctx, input)).status,
      'authorized',
      'an order that is already authorized is not authorized again',
    );
  });

  await check('capture, void, refund, status', async () => {
    const authorized = withAuth('CREATED');
    route('GET /v2/checkout/orders/5O190127TN364715T', { status: 200, body: authorized });
    route('POST /v2/payments/authorizations/AUTH1234567/capture', (r) => {
      const b = JSON.parse(r.body ?? '{}') as Record<string, unknown>;
      assert.deepEqual(b, {
        amount: { currency_code: 'USD', value: '120.50' },
        final_capture: true,
      });
      return { status: 201, body: { id: 'CAP1234567', status: 'COMPLETED' } };
    });
    const cap = await adapter.capture?.(ctx, {
      idempotencyKey: 'pay_1:capture',
      processorTransactionId: '5O190127TN364715T',
      amount: Money.parse('120.50'),
    });
    assert.equal(cap?.status, 'captured');
    assert.equal(cap?.processorTransactionId, '5O190127TN364715T');
    assert.equal(
      seen.find((r) => r.url.endsWith('/capture'))?.headers['paypal-request-id'],
      'pay_1:capture',
    );
    route('POST /v2/payments/authorizations/AUTH1234567/capture', {
      status: 201,
      body: { id: 'C2', status: 'DECLINED', processor_response: { response_code: '5120' } },
    });
    const refused = await adapter.capture?.(ctx, {
      idempotencyKey: 'pay_1:capture',
      processorTransactionId: '5O190127TN364715T',
      amount: Money.parse('120.50'),
    });
    assert.deepEqual(
      [refused?.status, refused?.declineCategory],
      ['declined', 'insufficient_funds'],
    );
    route('POST /v2/payments/authorizations/AUTH1234567/void', { status: 204, body: {} });
    assert.equal(
      (
        await adapter.voidAuthorization?.(ctx, {
          idempotencyKey: 'pay_1:void',
          processorTransactionId: '5O190127TN364715T',
        })
      )?.status,
      'voided',
    );
    route('POST /v2/payments/authorizations/AUTH1234567/void', {
      status: 422,
      body: { details: [{ issue: 'AUTHORIZATION_VOIDED' }] },
    });
    assert.equal(
      (
        await adapter.voidAuthorization?.(ctx, {
          idempotencyKey: 'pay_1:void',
          processorTransactionId: '5O190127TN364715T',
        })
      )?.status,
      'voided',
      'already voided is voided',
    );
    // refund needs the capture id taken from the order
    const captured = order(
      { status: 'COMPLETED' },
      {
        payments: {
          authorizations: [{ id: 'AUTH1234567', status: 'CAPTURED' }],
          captures: [{ id: 'CAP1234567', status: 'COMPLETED' }],
        },
      },
    );
    route('GET /v2/checkout/orders/5O190127TN364715T', { status: 200, body: captured });
    route('POST /v2/payments/captures/CAP1234567/refund', (r) => {
      assert.deepEqual(JSON.parse(r.body ?? '{}'), {
        amount: { currency_code: 'USD', value: '25.00' },
        note_to_payer: 'duplicate order',
      });
      return { status: 201, body: { id: '1JU08902781691411', status: 'COMPLETED' } };
    });
    const refund = await adapter.refund(ctx, {
      idempotencyKey: 'rf_1:refund',
      processorTransactionId: '5O190127TN364715T',
      amount: Money.parse('25'),
      reason: 'duplicate order',
    });
    assert.equal(refund.status, 'refunded');
    route('POST /v2/payments/captures/CAP1234567/refund', {
      status: 201,
      body: { id: 'R2', status: 'PENDING' },
    });
    assert.equal(
      (
        await adapter.refund(ctx, {
          idempotencyKey: 'rf_2:refund',
          processorTransactionId: '5O190127TN364715T',
          amount: Money.parse('1'),
          reason: null,
        })
      ).status,
      'pending',
    );
    route('POST /v2/payments/captures/CAP1234567/refund', {
      status: 422,
      body: { details: [{ issue: 'CAPTURE_FULLY_REFUNDED' }] },
    });
    assert.equal(
      (
        await adapter.refund(ctx, {
          idempotencyKey: 'rf_3:refund',
          processorTransactionId: '5O190127TN364715T',
          amount: Money.parse('1'),
          reason: null,
        })
      ).status,
      'declined',
    );
    route('GET /v2/checkout/orders/5O190127TN364715T', { status: 200, body: authorized });
    assert.equal(
      (
        await adapter.refund(ctx, {
          idempotencyKey: 'rf_4:refund',
          processorTransactionId: '5O190127TN364715T',
          amount: Money.parse('1'),
          reason: null,
        })
      ).declineCategory,
      'other',
      'nothing captured yet',
    );
    assert.equal((await adapter.getTransaction(ctx, '5O190127TN364715T')).status, 'authorized');
    route('GET /v2/checkout/orders/5O190127TN364715T', { status: 200, body: captured });
    assert.equal((await adapter.getTransaction(ctx, '5O190127TN364715T')).status, 'captured');
    route('GET /v2/checkout/orders/5O190127TN364715T', {
      status: 200,
      body: order({
        status: 'PAYER_ACTION_REQUIRED',
        links: [
          {
            rel: 'payer-action',
            href: 'https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T',
          },
        ],
      }),
    });
    const action = await adapter.getTransaction(ctx, '5O190127TN364715T');
    assert.deepEqual([action.status, action.requiredAction?.kind], ['requires_action', 'redirect']);
    await assert.rejects(() => adapter.getTransaction(ctx, '../x'), /order id/);
  });

  await check('failures: credentials, outages', async () => {
    route('POST /v1/oauth2/token', { status: 401, body: { error: 'invalid_client' } });
    await assert.rejects(() => adapter.authorize(ctx, input), /did not accept the client id/);
    clearTokenCache();
    route('POST /v1/oauth2/token', { status: 200, body: { access_token: 'tok', expires_in: 100 } });
    route('GET /v2/checkout/orders/5O190127TN364715T', { status: 503, body: {} });
    await assert.rejects(() => adapter.authorize(ctx, input));
    route('GET /v2/checkout/orders/5O190127TN364715T', { status: 403, body: {} });
    await assert.rejects(() => adapter.authorize(ctx, input), /permissions/);
    await assert.rejects(
      () =>
        adapter.authorize({ ...ctx, credentials: { ...ctx.credentials, clientSecret: '' } }, input),
      /missing/,
    );
  });

  await check('test connection', async () => {
    route('GET /v1/notifications/webhooks/0NH55953DH663215D', {
      status: 200,
      body: { id: '0NH55953DH663215D' },
    });
    assert.equal((await adapter.testConnection(ctx)).ok, true);
    route('GET /v1/notifications/webhooks/0NH55953DH663215D', { status: 404, body: {} });
    const missing = await adapter.testConnection(ctx);
    assert.equal(missing.ok, false);
    assert.match(missing.message, /webhook id/);
    clearTokenCache();
    route('POST /v1/oauth2/token', { status: 401, body: {} });
    const bad = await adapter.testConnection(ctx);
    assert.equal(bad.ok, false);
    assert.ok(!JSON.stringify(bad).includes('EXxyz'));
  });

  await check('webhook verification: postback with the raw event', async () => {
    const raw =
      '{"id":"WH-1AB","event_version":"1.0","create_time":"2026-10-17T10:00:00.000Z","resource_type":"capture","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"CAP1","supplementary_data":{"related_ids":{"order_id":"5O190127TN364715T"}}},"extra":  {"spaces":   1}}';
    const now = Date.now();
    const headers = (over: Record<string, string> = {}): Record<string, string> => ({
      'paypal-transmission-id': 'db49fb10-1343-11ef-ac58-e32457403f67',
      'paypal-transmission-time': new Date(now - 5000).toISOString(),
      'paypal-transmission-sig': 'c2lnbmF0dXJl',
      'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42',
      'paypal-auth-algo': 'SHA256withRSA',
      ...over,
    });
    let posted = '';
    route('POST /v1/notifications/verify-webhook-signature', (r) => {
      posted = r.body ?? '';
      return { status: 200, body: { verification_status: 'SUCCESS' } };
    });
    assert.equal(await adapter.verifyWebhook(ctx, { headers: headers(), rawBody: raw }), true);
    assert.ok(
      posted.includes(`"webhook_event":${raw}}`),
      'the event is posted exactly as received',
    );
    const parsed = JSON.parse(posted) as Record<string, unknown>;
    assert.equal(parsed.webhook_id, '0NH55953DH663215D');
    assert.equal(parsed.transmission_id, 'db49fb10-1343-11ef-ac58-e32457403f67');
    assert.equal(parsed.auth_algo, 'SHA256withRSA');
    route('POST /v1/notifications/verify-webhook-signature', {
      status: 200,
      body: { verification_status: 'FAILURE' },
    });
    assert.equal(await adapter.verifyWebhook(ctx, { headers: headers(), rawBody: raw }), false);
    route('POST /v1/notifications/verify-webhook-signature', { status: 500, body: {} });
    assert.equal(await adapter.verifyWebhook(ctx, { headers: headers(), rawBody: raw }), false);
    route('POST /v1/notifications/verify-webhook-signature', {
      status: 200,
      body: { verification_status: 'SUCCESS' },
    });
    seen.length = 0;
    assert.equal(
      await adapter.verifyWebhook(ctx, {
        headers: headers({ 'paypal-transmission-time': new Date(now - 400_000).toISOString() }),
        rawBody: raw,
      }),
      false,
      'stale',
    );
    assert.equal(
      await adapter.verifyWebhook(ctx, {
        headers: headers({ 'paypal-transmission-time': new Date(now + 400_000).toISOString() }),
        rawBody: raw,
      }),
      false,
      'future',
    );
    assert.equal(
      await adapter.verifyWebhook(ctx, {
        headers: headers({ 'paypal-cert-url': 'https://evil.example/cert.pem' }),
        rawBody: raw,
      }),
      false,
      'certificate address of another host',
    );
    assert.equal(
      await adapter.verifyWebhook(ctx, {
        headers: headers({ 'paypal-cert-url': 'http://api.paypal.com/cert' }),
        rawBody: raw,
      }),
      false,
    );
    assert.equal(
      await adapter.verifyWebhook(ctx, {
        headers: headers({ 'paypal-cert-url': 'https://paypal.com.evil.example/cert' }),
        rawBody: raw,
      }),
      false,
    );
    const missing = headers();
    delete missing['paypal-transmission-sig'];
    assert.equal(await adapter.verifyWebhook(ctx, { headers: missing, rawBody: raw }), false);
    assert.equal(
      await adapter.verifyWebhook(ctx, { headers: headers(), rawBody: 'not json' }),
      false,
    );
    assert.equal(
      await adapter.verifyWebhook(
        { ...ctx, credentials: { ...ctx.credentials, webhookId: '' } },
        { headers: headers(), rawBody: raw },
      ),
      false,
    );
    assert.equal(
      seen.filter((r) => r.url.includes('verify-webhook')).length,
      0,
      'refused deliveries never reach PayPal',
    );
  });

  await check('webhook parsing', () => {
    const e = (type: string, resource: Record<string, unknown>): string =>
      JSON.stringify({
        id: `WH-${type}`,
        event_type: type,
        create_time: '2026-10-17T10:00:00.000Z',
        resource,
      });
    const related = { supplementary_data: { related_ids: { order_id: '5O190127TN364715T' } } };
    const pick = (
      type: string,
      resource: Record<string, unknown>,
    ): ReturnType<typeof adapter.parseWebhook> =>
      adapter.parseWebhook({ headers: {}, rawBody: e(type, resource) });
    const expected: [string, string][] = [
      ['PAYMENT.AUTHORIZATION.CREATED', 'payment.authorized'],
      ['PAYMENT.AUTHORIZATION.VOIDED', 'payment.voided'],
      ['PAYMENT.CAPTURE.COMPLETED', 'payment.captured'],
      ['PAYMENT.CAPTURE.DECLINED', 'payment.failed'],
      ['PAYMENT.CAPTURE.DENIED', 'payment.failed'],
      ['PAYMENT.CAPTURE.REFUNDED', 'payment.refunded'],
    ];
    for (const [paypalType, type] of expected) {
      const event = pick(paypalType, { id: 'X1', ...related });
      assert.deepEqual(
        [event.type, event.processorTransactionId, event.eventId],
        [type, '5O190127TN364715T', `WH-${paypalType}`],
      );
      assert.equal(event.occurredAt, '2026-10-17T10:00:00.000Z');
    }
    const dispute = pick('CUSTOMER.DISPUTE.CREATED', {
      dispute_id: 'PP-D-1',
      disputed_transactions: [{ seller_transaction_id: 'CAP1' }],
    });
    assert.deepEqual(
      [dispute.type, dispute.processorTransactionId, dispute.payload.disputeId],
      ['dispute.opened', null, 'PP-D-1'],
    );
    assert.equal(
      pick('CUSTOMER.DISPUTE.RESOLVED', { dispute_id: 'PP-D-1' }).type,
      'dispute.closed',
    );
    assert.equal(pick('CHECKOUT.ORDER.APPROVED', { id: 'O1' }).type, 'unknown');
    assert.throws(() => adapter.parseWebhook({ headers: {}, rawBody: 'x' }));
    assert.equal(avsPostal('Y'), true);
    assert.equal(avsPostal('A'), false);
    assert.equal(avsPostal('G'), null);
    assert.equal(avsPostal(null), null);
  });

  setTransportForVerification(null);
  process.stdout.write(`step11-paypal: ${checks} checks passed\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
