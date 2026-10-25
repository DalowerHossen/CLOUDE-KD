// path: scripts/verify/step12-adyen.ts
// Checks the Adyen adapter against a local fake transport that answers with the response shapes of Adyen's Checkout API
// v71 and its documented webhook signature (docs/processors/adyen.md). It does NOT replace the sandbox run listed in
// docs/processors/adyen.verify.md.
// Run: npx tsx --conditions=react-server scripts/verify/step12-adyen.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { adapter } from '@/lib/payment/adapters/adyen';
import { cardIdentity, fromRefundAnswer } from '@/lib/payment/adapters/adyen/mapping';
import { signedData } from '@/lib/payment/adapters/adyen/webhook';
import { adapterProblems } from '@/lib/payment/capabilities';
import {
  setTransportForVerification,
  type HttpRequest,
  type HttpResponse,
} from '@/lib/payment/http-client';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, AuthorizeInput } from '@/types/contracts';

const HMAC_KEY = '44782DEF547AAA06C910C43932B1EB0C71FC68D9D0C057550C48EC2ACF6BA056';
const ctx: AdapterContext = {
  credentials: {
    apiKey: 'AQEyhmfxK4PIaxFbw0m_adyen_key_0123456789',
    clientKey: 'test_870be2abcdefghijklmnopqrstu',
    merchantAccount: 'KdMerchantECOM',
    hmacKey: HMAC_KEY,
    countryCode: 'US',
    livePrefix: '1797a841fbb37ca7-AdyenDemo',
  },
  environment: 'sandbox',
  mode: 'web_dropin',
  correlationId: 'c1',
};
const SESSION = 'CSD9CAC34EBAE225DD';
const PROOF = 'Ab02b4c0!BQABAgB+f2Xk/pNTt3Vt==';
const TOKEN = `${SESSION}.${PROOF}`;
const PSP = 'TG9SNBJJNXRKDM92';
const input: AuthorizeInput = {
  idempotencyKey: 'a3c1f2d4-1111-4222-8333-444455556666:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'inv-uuid-1',
  companyId: 'co',
  paymentToken: TOKEN,
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
const route = (key: string, reply: Reply): void => void routes.set(key, reply);
setTransportForVerification(async (request): Promise<HttpResponse> => {
  seen.push(request);
  const url = new URL(request.url);
  const found = routes.get(`${request.method} ${url.pathname}`);
  const reply = found ?? { status: 422, body: { status: 422, errorCode: '000', message: 'x' } };
  return { status: reply.status ?? 200, text: JSON.stringify(reply.body), headers: {} };
});

const sessionResult = (over: Json = {}): Json => ({
  id: SESSION,
  reference: 'inv-uuid-1',
  status: 'completed',
  payments: [
    {
      amount: { currency: 'USD', value: 12050 },
      paymentMethod: { brand: 'visa', type: 'scheme' },
      pspReference: PSP,
      resultCode: 'Authorised',
    },
  ],
  additionalData: { cardBin: '411111', cardSummary: '1142', expiryDate: '3/2030' },
  ...over,
});
const bodyOf = (r: HttpRequest | undefined): Json => JSON.parse(r?.body ?? '{}') as Json;
const sessionPath = `/v71/sessions/${SESSION}`;

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

const item = (over: Json = {}): Json => ({
  pspReference: '7914073381342284',
  originalReference: '',
  merchantAccountCode: 'TestMerchant',
  merchantReference: 'TestPayment-1407325143704',
  amount: { value: 1130, currency: 'EUR' },
  eventCode: 'AUTHORISATION',
  eventDate: '2026-10-18T10:00:00+02:00',
  success: 'true',
  ...over,
});
// The documented signature recomputed here from the documented steps (hex key to bytes, colon-joined data, Base64).
const documentedSignature = (i: Json, key = HMAC_KEY): string => {
  const a = i.amount as { value: number; currency: string };
  const data = [
    i.pspReference,
    i.originalReference ?? '',
    i.merchantAccountCode,
    i.merchantReference,
    a.value,
    a.currency,
    i.eventCode,
    i.success,
  ].join(':');
  return createHmac('sha256', Buffer.from(key, 'hex')).update(data, 'utf8').digest('base64');
};
const notification = (items: Json[], signed = true, key = HMAC_KEY): string =>
  JSON.stringify({
    live: 'false',
    notificationItems: items.map((i) => ({
      NotificationRequestItem: {
        ...i,
        additionalData: signed ? { hmacSignature: documentedSignature(i, key) } : {},
      },
    })),
  });
const hook = (raw: string): Promise<boolean> =>
  adapter.verifyWebhook(ctx, { rawBody: raw, headers: {} });

async function main(): Promise<void> {
  await check('contract: one-step card sale, no lookup', () => {
    assert.deepEqual(adapterProblems(adapter), []);
    assert.equal(adapter.capabilities.supportsAuthCapture, false);
    assert.equal(adapter.capabilities.isMerchantOfRecord, false);
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

  await check('session: exact request, public data only', async () => {
    route('POST /v71/sessions', {
      status: 201,
      body: { id: SESSION, sessionData: 'Ab02b4c...', expiresAt: '2026-10-18T11:00:00Z' },
    });
    const result = await session();
    assert.equal(result.clientConfig.sessionId, SESSION);
    assert.equal(result.clientConfig.sessionData, 'Ab02b4c...');
    assert.equal(result.clientConfig.clientKey, ctx.credentials.clientKey);
    assert.equal(result.clientConfig.environment, 'test');
    assert.equal(result.clientConfig.amount, '12050');
    assert.equal(
      result.clientConfig.scriptUrl,
      'https://checkoutshopper-test.cdn.adyen.com/checkoutshopper/sdk/6.46.0/adyen.js',
    );
    assert.match(result.clientConfig.scriptIntegrity ?? '', /^sha384-/);
    assert.equal(result.expiresAt, '2026-10-18T11:00:00Z');
    assert.ok(!JSON.stringify(result).includes('adyen_key'));
    assert.ok(!JSON.stringify(result).includes(HMAC_KEY));
    const request = seen[0];
    assert.equal(request?.url, 'https://checkout-test.adyen.com/v71/sessions');
    assert.equal(request?.headers['x-api-key'], ctx.credentials.apiKey);
    assert.match(request?.headers['idempotency-key'] ?? '', /^[0-9a-f]{40}$/);
    assert.deepEqual(bodyOf(request), {
      merchantAccount: 'KdMerchantECOM',
      amount: { value: 12050, currency: 'USD' },
      reference: 'inv-uuid-1',
      returnUrl: input.returnUrl,
      countryCode: 'US',
      channel: 'Web',
      allowedPaymentMethods: ['scheme'],
      authenticationData: { threeDSRequestData: { nativeThreeDS: 'disabled' } },
      metadata: { invoice_id: 'inv-uuid-1' },
    });
    routes = new Map();
    route('POST /checkout/v71/sessions', { status: 201, body: { id: SESSION, sessionData: 'x' } });
    const live = await session({ ...ctx, environment: 'live' });
    assert.equal(
      seen[1]?.url,
      'https://1797a841fbb37ca7-AdyenDemo-checkout-live.adyenpayments.com/checkout/v71/sessions',
    );
    assert.equal(live.clientConfig.environment, 'live');
    assert.ok(
      live.clientConfig.scriptUrl?.startsWith('https://checkoutshopper-live.cdn.adyen.com/'),
    );
  });

  await check('session: refusals', async () => {
    route('POST /v71/sessions', { status: 422, body: { errorCode: '130', message: 'x' } });
    await assert.rejects(session(), /130/);
    route('POST /v71/sessions', { status: 201, body: { id: SESSION } });
    await assert.rejects(session(), ValidationError);
    for (const key of ['clientKey', 'merchantAccount', 'countryCode'])
      await assert.rejects(
        session({ ...ctx, credentials: { ...ctx.credentials, [key]: '' } }),
        ValidationError,
      );
    await assert.rejects(
      session({ ...ctx, environment: 'live', credentials: { ...ctx.credentials, livePrefix: '' } }),
      ValidationError,
    );
    route('POST /v71/sessions', { status: 401, body: {} });
    await assert.rejects(session(), /did not accept/);
    route('POST /v71/sessions', { status: 503, body: {} });
    await assert.rejects(session(), /unavailable/);
  });

  await check('charge and authorize verify the session result', async () => {
    route(`GET ${sessionPath}`, { body: sessionResult() });
    for (const call of [adapter.charge, adapter.authorize]) {
      const result = await call?.(ctx, input);
      assert.equal(result?.status, 'captured');
      assert.equal(result?.amount.toDbString(), '120.5000');
      assert.equal(result?.processorTransactionId, PSP);
      assert.deepEqual(result?.cardIdentity, {
        type: 'fingerprint',
        value: '411111|1142|3/2030|visa',
        last4: '1142',
        brand: 'visa',
      });
    }
    const url = new URL(seen[0]?.url ?? '');
    assert.equal(url.pathname, sessionPath);
    assert.equal(url.searchParams.get('sessionResult'), PROOF);
    assert.equal(cardIdentity({ additionalData: {} }, null), null);
  });

  await check('verification: refusals', async () => {
    const cases: Array<[string, Json]> = [
      ['pending', sessionResult({ status: 'paymentPending', payments: [] })],
      ['canceled', sessionResult({ status: 'canceled', payments: [] })],
      ['refused', sessionResult({ status: 'refused', payments: [] })],
      ['other reference', sessionResult({ reference: 'inv-other' })],
      [
        'other amount',
        sessionResult({
          payments: [
            {
              amount: { currency: 'USD', value: 9900 },
              pspReference: PSP,
              resultCode: 'Authorised',
            },
          ],
        }),
      ],
      [
        'other currency',
        sessionResult({
          payments: [
            {
              amount: { currency: 'EUR', value: 12050 },
              pspReference: PSP,
              resultCode: 'Authorised',
            },
          ],
        }),
      ],
      [
        'not authorised',
        sessionResult({
          payments: [
            { amount: { currency: 'USD', value: 12050 }, pspReference: PSP, resultCode: 'Refused' },
          ],
        }),
      ],
      [
        'bad psp reference',
        sessionResult({
          payments: [
            {
              amount: { currency: 'USD', value: 12050 },
              pspReference: 'x',
              resultCode: 'Authorised',
            },
          ],
        }),
      ],
      ['other session id', sessionResult({ id: 'CSOTHER12345' })],
    ];
    for (const [name, body] of cases) {
      route(`GET ${sessionPath}`, { body });
      assert.equal((await adapter.charge?.(ctx, input))?.status, 'declined', name);
    }
    route(`GET ${sessionPath}`, { status: 422, body: {} });
    assert.equal((await adapter.charge?.(ctx, input))?.rawCode, 'SESSION_NOT_FOUND');
    for (const paymentToken of [
      'nodot',
      '.abc',
      `${SESSION}.`,
      `bad id.${PROOF}`,
      `${SESSION}.short`,
    ])
      await assert.rejects(
        adapter.charge?.(ctx, { ...input, paymentToken }) ?? Promise.resolve(),
        ValidationError,
        paymentToken,
      );
  });

  await check('refund: asynchronous, refusals, no lookup', async () => {
    route(`POST /v71/payments/${PSP}/refunds`, {
      status: 201,
      body: { status: 'received', pspReference: 'QWERTY0987654321', paymentPspReference: PSP },
    });
    const result = await adapter.refund?.(ctx, {
      idempotencyKey: 'rk1',
      processorTransactionId: PSP,
      amount: Money.parse('20.00'),
      reason: 'dup',
    });
    assert.equal(result?.status, 'pending');
    assert.equal(result?.processorTransactionId, 'QWERTY0987654321');
    assert.deepEqual(bodyOf(seen[0]), {
      merchantAccount: 'KdMerchantECOM',
      amount: { value: 2000, currency: 'USD' },
      reference: 'refund-rk1',
    });
    assert.match(seen[0]?.headers['idempotency-key'] ?? '', /^[0-9a-f]{40}$/);
    route(`POST /v71/payments/${PSP}/refunds`, {
      status: 422,
      body: { errorCode: '167', message: 'x' },
    });
    const bad = await adapter.refund?.(ctx, {
      idempotencyKey: 'rk2',
      processorTransactionId: PSP,
      amount: Money.parse('20.00'),
      reason: null,
    });
    assert.equal(bad?.status, 'declined');
    assert.equal(bad?.rawCode, '167');
    assert.equal(fromRefundAnswer({ status: 'other' }, Money.parse('1')).status, 'declined');
    await assert.rejects(
      adapter.refund?.(ctx, {
        idempotencyKey: 'rk3',
        processorTransactionId: 'nope',
        amount: Money.parse('1'),
        reason: null,
      }) ?? Promise.resolve(),
      ValidationError,
    );
    await assert.rejects(
      adapter.getTransaction?.(ctx, PSP) ?? Promise.resolve(),
      /reads a payment back/,
    );
  });

  await check('decline mapping and connection test', async () => {
    const cases: Array<[string, string]> = [
      ['12', 'insufficient_funds'],
      ['8', 'invalid_number'],
      ['6', 'invalid_expiry'],
      ['24', 'invalid_cvv'],
      ['11', 'three_ds_failed'],
      ['20', 'processor_fraud_signal'],
      ['2', 'do_not_honor'],
      ['4', 'processor_error'],
      ['99', 'other'],
    ];
    for (const [code, category] of cases)
      assert.equal(adapter.mapDecline({ code, message: null }), category, code);
    route('GET /v71/sessions/CSKDCONNECTIONCHECK', { status: 422, body: { errorCode: '000' } });
    assert.equal((await adapter.testConnection(ctx)).ok, true);
    route('GET /v71/sessions/CSKDCONNECTIONCHECK', { status: 401, body: {} });
    const refused = await adapter.testConnection(ctx);
    assert.equal(refused.ok, false);
    assert.ok(!refused.message.includes('adyen_key'));
    route('GET /v71/sessions/CSKDCONNECTIONCHECK', { status: 503, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
  });

  await check('webhooks: documented signature', async () => {
    // The data string of the documentation's own example.
    assert.equal(
      signedData(item()),
      '7914073381342284::TestMerchant:TestPayment-1407325143704:1130:EUR:AUTHORISATION:true',
    );
    assert.equal(await hook(notification([item()])), true);
    assert.equal(
      await hook(
        notification([
          item(),
          item({
            pspReference: '1111111111111111',
            eventCode: 'REFUND',
            originalReference: '7914073381342284',
          }),
        ]),
      ),
      true,
    );
    assert.equal(await hook(notification([item()], false)), false);
    assert.equal(await hook(notification([item()], true, 'AA'.repeat(32))), false);
    const tampered = notification([item()]).replace('1130', '1');
    assert.equal(await hook(tampered), false);
    const mixed = JSON.parse(
      notification([item(), item({ pspReference: '2222222222222222' })]),
    ) as { notificationItems: Array<{ NotificationRequestItem: { merchantReference: string } }> };
    const second = mixed.notificationItems[1];
    if (second) second.NotificationRequestItem.merchantReference = 'changed';
    assert.equal(await hook(JSON.stringify(mixed)), false);
    assert.equal(await hook('{"notificationItems":[]}'), false);
    assert.equal(await hook('not json'), false);
    assert.equal(await hook(''), false);
    assert.equal(
      await adapter.verifyWebhook(
        { ...ctx, credentials: { ...ctx.credentials, hmacKey: 'zz' } },
        { rawBody: notification([item()]), headers: {} },
      ),
      false,
    );
  });

  await check('webhooks: events', () => {
    const parse = (i: Json): ReturnType<typeof adapter.parseWebhook> =>
      adapter.parseWebhook({ rawBody: notification([i]), headers: {} });
    const paid = parse(item());
    assert.equal(paid.type, 'payment.captured');
    assert.equal(paid.processorTransactionId, '7914073381342284');
    assert.equal(paid.eventId, 'AUTHORISATION:7914073381342284:true');
    assert.equal(paid.occurredAt, '2026-10-18T08:00:00.000Z');
    assert.equal(parse(item({ success: 'false' })).type, 'payment.failed');
    const failedCapture = parse(
      item({
        eventCode: 'CAPTURE_FAILED',
        pspReference: '3333333333333333',
        originalReference: '7914073381342284',
      }),
    );
    assert.equal(failedCapture.type, 'payment.failed');
    assert.equal(failedCapture.processorTransactionId, '7914073381342284');
    const refund = parse(
      item({
        eventCode: 'REFUND',
        pspReference: '4444444444444444',
        originalReference: '7914073381342284',
      }),
    );
    assert.equal(refund.type, 'payment.refunded');
    assert.equal(refund.processorTransactionId, '7914073381342284');
    assert.equal(
      parse(item({ eventCode: 'REFUND', success: 'false', originalReference: 'X' })).type,
      'unknown',
    );
    assert.equal(
      parse(item({ eventCode: 'CANCELLATION', originalReference: '7914073381342284' })).type,
      'payment.voided',
    );
    assert.equal(
      parse(item({ eventCode: 'EXPIRE', originalReference: '7914073381342284' })).type,
      'payment.voided',
    );
    assert.equal(
      parse(
        item({ eventCode: 'NOTIFICATION_OF_CHARGEBACK', originalReference: '7914073381342284' }),
      ).type,
      'dispute.opened',
    );
    assert.equal(
      parse(item({ eventCode: 'CHARGEBACK_REVERSED', originalReference: '7914073381342284' })).type,
      'dispute.closed',
    );
    assert.equal(parse(item({ eventCode: 'REPORT_AVAILABLE' })).type, 'unknown');
    const mixedItems = adapter.parseWebhook({
      rawBody: notification([
        item({ eventCode: 'REPORT_AVAILABLE' }),
        item({ pspReference: '5555555555555555' }),
      ]),
      headers: {},
    });
    assert.equal(mixedItems.processorTransactionId, '5555555555555555');
  });

  process.stdout.write(`step12-adyen: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
