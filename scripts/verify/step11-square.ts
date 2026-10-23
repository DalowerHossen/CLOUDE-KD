// path: scripts/verify/step11-square.ts
// Checks the Square adapter against a local fake transport that answers with the response shapes of Square's OpenAPI
// specification and documentation (docs/processors/square.md). It does NOT replace the sandbox run listed in
// docs/processors/square.verify.md. Run: npx tsx --conditions=react-server scripts/verify/step11-square.ts
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { adapter } from '@/lib/payment/adapters/square';
import { requestKey } from '@/lib/payment/adapters/square/api';
import { avsPostal, cardIdentity } from '@/lib/payment/adapters/square/mapping';
import { adapterProblems } from '@/lib/payment/capabilities';
import {
  setTransportForVerification,
  type HttpRequest,
  type HttpResponse,
} from '@/lib/payment/http-client';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, AuthorizeInput } from '@/types/contracts';

const URL_OF_HOOK = 'https://app.example.com/api/webhooks/square';
const ctx: AdapterContext = {
  credentials: {
    applicationId: 'sandbox-sq0idb-abcdefghij',
    locationId: 'LHJ4TESTLOC01',
    accessToken: 'EAAAtesttoken0123456789abcdef',
    webhookSignatureKey: 'sigkey_0123456789',
    webhookUrl: URL_OF_HOOK,
  },
  environment: 'sandbox',
  mode: 'web_payments',
  correlationId: 'c1',
};
const PAY = 'Zg81uQkAcCh1aJMAPymUzilP4ADZY';
const input: AuthorizeInput = {
  idempotencyKey: 'a3c1f2d4-1111-4222-8333-444455556666:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'inv-uuid-1',
  companyId: 'co',
  paymentToken: 'cnon:card-nonce-ok',
  billing: { postalCode: '10001', country: 'US' },
  payerIp: '203.0.113.5',
  returnUrl: 'https://app.example.com/pay/x',
  threeDS: 'disabled',
  metadata: {},
};

type Json = Record<string, unknown>;
type Reply = { status?: number; body: unknown };
const seen: HttpRequest[] = [];
let routes = new Map<string, Reply | ((r: HttpRequest) => Reply)>();
const route = (key: string, reply: Reply | ((r: HttpRequest) => Reply)): void =>
  void routes.set(key, reply);
setTransportForVerification(async (request): Promise<HttpResponse> => {
  seen.push(request);
  const found = routes.get(`${request.method} ${new URL(request.url).pathname}`);
  if (!found) return { status: 404, text: '{}', headers: {} };
  const reply = typeof found === 'function' ? found(request) : found;
  return { status: reply.status ?? 200, text: JSON.stringify(reply.body), headers: {} };
});

const card: Json = {
  card_brand: 'VISA',
  last_4: '5858',
  exp_month: 12,
  exp_year: 2030,
  fingerprint: 'sq-1-INCyQnSb8QOHkoFASh566s5S',
  bin: '453275',
};
const payment = (status: string, over: Json = {}, details: Json = {}): Json => ({
  id: PAY,
  status,
  amount_money: { amount: 12050, currency: 'USD' },
  source_type: 'CARD',
  card_details: { status: 'AUTHORIZED', card, avs_status: 'AVS_ACCEPTED', ...details },
  ...over,
});
const failure = (category: string, code: string, status = 400): Reply => ({
  status,
  body: { errors: [{ category, code, detail: 'd' }] },
});
const bodyOf = (r: HttpRequest | undefined): Json => JSON.parse(r?.body ?? '{}') as Json;

function setup(): void {
  routes = new Map();
  seen.length = 0;
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
const signed = (body: string, key = 'sigkey_0123456789', url = URL_OF_HOOK): string =>
  createHmac('sha256', key).update(`${url}${body}`).digest('base64');

async function main(): Promise<void> {
  await check('contract is complete', () => {
    assert.deepEqual(adapterProblems(adapter), []);
    assert.deepEqual(
      adapter.credentialFields.map((f) => [f.key, f.secret]),
      [
        ['applicationId', false],
        ['locationId', false],
        ['accessToken', true],
        ['webhookSignatureKey', true],
        ['webhookUrl', false],
      ],
    );
    assert.equal(adapter.capabilities.supportsThreeDS, false);
  });

  await check('request key: fixed length, deterministic, within the 45 character limit', () => {
    const key = requestKey(input.idempotencyKey);
    assert.equal(key.length, 40);
    assert.equal(key, requestKey(input.idempotencyKey));
    assert.notEqual(key, requestKey(`${input.idempotencyKey}x`));
    assert.equal(key, createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 40));
  });

  await check('checkout session: public data only', async () => {
    const session = await adapter.createCheckoutSession(ctx, {
      idempotencyKey: 'k',
      amount: Money.parse('120.5'),
      invoiceId: 'inv',
      companyId: 'co',
      returnUrl: 'https://app.example.com/x',
      threeDS: 'disabled',
    });
    assert.deepEqual(session.clientConfig, {
      applicationId: 'sandbox-sq0idb-abcdefghij',
      locationId: 'LHJ4TESTLOC01',
      sdkUrl: 'https://sandbox.web.squarecdn.com/v1/square.js',
      environment: 'sandbox',
      amount: '120.50',
    });
    assert.ok(!JSON.stringify(session).includes('EAAA'));
    const live = await adapter.createCheckoutSession(
      { ...ctx, environment: 'live' },
      {
        idempotencyKey: 'k',
        amount: Money.parse('1'),
        invoiceId: 'i',
        companyId: 'c',
        returnUrl: 'https://app.example.com/x',
        threeDS: 'disabled',
      },
    );
    assert.equal(live.clientConfig.sdkUrl, 'https://web.squarecdn.com/v1/square.js');
    await assert.rejects(
      adapter.createCheckoutSession(
        { ...ctx, credentials: {} },
        {
          idempotencyKey: 'k',
          amount: Money.parse('1'),
          invoiceId: 'i',
          companyId: 'c',
          returnUrl: 'https://app.example.com/x',
          threeDS: 'disabled',
        },
      ),
      ValidationError,
    );
  });

  await check('authorize: request as documented, result mapped', async () => {
    route('POST /v2/payments', (r) => {
      const b = bodyOf(r);
      assert.equal(r.url, 'https://connect.squareupsandbox.com/v2/payments');
      assert.equal(r.headers.authorization, 'Bearer EAAAtesttoken0123456789abcdef');
      assert.equal(r.headers['square-version'], '2026-09-16');
      assert.equal(b.source_id, 'cnon:card-nonce-ok');
      assert.equal(b.idempotency_key, requestKey(input.idempotencyKey));
      assert.deepEqual(b.amount_money, { amount: 12050, currency: 'USD' });
      assert.equal(b.autocomplete, false);
      assert.equal(b.delay_action, 'CANCEL');
      assert.equal(b.delay_duration, 'PT144H');
      assert.equal(b.location_id, 'LHJ4TESTLOC01');
      assert.equal(b.reference_id, 'inv-uuid-1');
      assert.deepEqual(b.customer_details, { customer_initiated: true, seller_keyed_in: false });
      return { body: { payment: payment('APPROVED') } };
    });
    const result = await adapter.authorize(ctx, input);
    assert.equal(result.status, 'authorized');
    assert.equal(result.processorTransactionId, PAY);
    assert.ok(result.amount.eq('120.50'));
    assert.equal(result.avsPostalCodeMatch, true);
    assert.deepEqual(result.cardIdentity, {
      type: 'fingerprint',
      value: 'sq-1-INCyQnSb8QOHkoFASh566s5S',
    });
    assert.deepEqual(result.threeDS, {
      requested: false,
      completed: false,
      authenticated: false,
      liabilityShift: null,
    });
  });

  await check('authorize: AVS and identity fallbacks', async () => {
    route('POST /v2/payments', {
      body: {
        payment: payment(
          'APPROVED',
          {},
          { avs_status: 'AVS_REJECTED', card: { ...card, fingerprint: null } },
        ),
      },
    });
    const result = await adapter.authorize(ctx, input);
    assert.equal(result.avsPostalCodeMatch, false);
    assert.deepEqual(result.cardIdentity, {
      type: 'fingerprint',
      value: '453275|5858|12/2030|VISA',
    });
    assert.equal(avsPostal('AVS_NOT_CHECKED'), null);
    assert.equal(cardIdentity(null), null);
    assert.equal(cardIdentity({ card_brand: 'VISA' }), null);
  });

  await check('declines by error code', async () => {
    const expected: [string, string][] = [
      ['INSUFFICIENT_FUNDS', 'insufficient_funds'],
      ['INVALID_CARD', 'invalid_number'],
      ['CARD_EXPIRED', 'invalid_expiry'],
      ['INVALID_EXPIRATION', 'invalid_expiry'],
      ['CVV_FAILURE', 'invalid_cvv'],
      ['CARD_DECLINED_VERIFICATION_REQUIRED', 'three_ds_failed'],
      ['CARD_DECLINED', 'do_not_honor'],
      ['GENERIC_DECLINE', 'do_not_honor'],
      ['ADDRESS_VERIFICATION_FAILURE', 'other'],
      ['CARD_TOKEN_USED', 'other'],
    ];
    for (const [code, category] of expected) {
      route('POST /v2/payments', failure('PAYMENT_METHOD_ERROR', code));
      const result = await adapter.authorize(ctx, input);
      assert.equal(result.status, 'declined', code);
      assert.equal(result.declineCategory, category, code);
      assert.equal(result.rawCode, code);
      assert.equal(adapter.mapDecline({ code, message: null }), category);
    }
    route('POST /v2/payments', {
      body: { payment: payment('FAILED', {}, { errors: [{ code: 'CVV_FAILURE' }] }) },
    });
    const failed = await adapter.authorize(ctx, input);
    assert.deepEqual([failed.status, failed.declineCategory], ['declined', 'invalid_cvv']);
  });

  await check('credentials and outages are not payment failures', async () => {
    route('POST /v2/payments', failure('AUTHENTICATION_ERROR', 'UNAUTHORIZED', 401));
    await assert.rejects(adapter.authorize(ctx, input), ValidationError);
    route('POST /v2/payments', failure('AUTHENTICATION_ERROR', 'ACCESS_TOKEN_EXPIRED', 401));
    await assert.rejects(adapter.authorize(ctx, input), ValidationError);
    route('POST /v2/payments', failure('API_ERROR', 'INTERNAL_SERVER_ERROR', 500));
    await assert.rejects(adapter.authorize(ctx, input), /unavailable/);
    route('POST /v2/payments', failure('RATE_LIMIT_ERROR', 'RATE_LIMITED', 429));
    await assert.rejects(adapter.authorize(ctx, input), /unavailable/);
    route('POST /v2/payments', failure('API_ERROR', 'SERVICE_UNAVAILABLE', 200));
    await assert.rejects(adapter.authorize(ctx, input), /unavailable/);
    await assert.rejects(adapter.authorize({ ...ctx, credentials: {} }, input), ValidationError);
    await assert.rejects(
      adapter.authorize(ctx, { ...input, paymentToken: 'ccof:customer-card-id-ok' }),
      ValidationError,
    );
    await assert.rejects(
      adapter.authorize(ctx, { ...input, paymentToken: 'x; drop table' }),
      ValidationError,
    );
  });

  await check('capture: full amount only, repeats are reported', async () => {
    route(`GET /v2/payments/${PAY}`, { body: { payment: payment('APPROVED') } });
    route(`POST /v2/payments/${PAY}/complete`, { body: { payment: payment('COMPLETED') } });
    const done = await adapter.capture?.(ctx, {
      idempotencyKey: 'pay_1:capture',
      processorTransactionId: PAY,
      amount: Money.parse('120.50'),
    });
    assert.equal(done?.status, 'captured');
    const partial = await adapter.capture?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: PAY,
      amount: Money.parse('100'),
    });
    assert.deepEqual([partial?.status, partial?.rawCode], ['declined', 'CAPTURE_AMOUNT_MISMATCH']);
    route(`GET /v2/payments/${PAY}`, { body: { payment: payment('COMPLETED') } });
    const again = await adapter.capture?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: PAY,
      amount: Money.parse('120.50'),
    });
    assert.equal(again?.status, 'captured');
    route(`GET /v2/payments/${PAY}`, { body: { payment: payment('CANCELED') } });
    assert.equal(
      (
        await adapter.capture?.(ctx, {
          idempotencyKey: 'k',
          processorTransactionId: PAY,
          amount: Money.parse('120.50'),
        })
      )?.status,
      'declined',
    );
    route(`GET /v2/payments/${PAY}`, {
      status: 404,
      body: { errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'NOT_FOUND' }] },
    });
    assert.equal(
      (
        await adapter.capture?.(ctx, {
          idempotencyKey: 'k',
          processorTransactionId: PAY,
          amount: Money.parse('1'),
        })
      )?.status,
      'declined',
    );
    await assert.rejects(
      adapter.capture?.(ctx, {
        idempotencyKey: 'k',
        processorTransactionId: '../x',
        amount: Money.parse('1'),
      }) ?? Promise.resolve(),
      ValidationError,
    );
  });

  await check('void, including an already cancelled authorization', async () => {
    route(`POST /v2/payments/${PAY}/cancel`, { body: { payment: payment('CANCELED') } });
    assert.equal(
      (
        await adapter.voidAuthorization?.(ctx, {
          idempotencyKey: 'pay_1:void',
          processorTransactionId: PAY,
        })
      )?.status,
      'voided',
    );
    route(
      `POST /v2/payments/${PAY}/cancel`,
      failure('INVALID_REQUEST_ERROR', 'DELAYED_TRANSACTION_CANCELED'),
    );
    route(`GET /v2/payments/${PAY}`, { body: { payment: payment('CANCELED') } });
    assert.equal(
      (await adapter.voidAuthorization?.(ctx, { idempotencyKey: 'k', processorTransactionId: PAY }))
        ?.status,
      'voided',
    );
    route(
      `POST /v2/payments/${PAY}/cancel`,
      failure('INVALID_REQUEST_ERROR', 'DELAYED_TRANSACTION_CAPTURED'),
    );
    const refused = await adapter.voidAuthorization?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: PAY,
    });
    assert.equal(refused?.status, 'declined');
  });

  await check('refund: request as documented, statuses and refusals', async () => {
    route('POST /v2/refunds', (r) => {
      const b = bodyOf(r);
      assert.equal(b.payment_id, PAY);
      assert.deepEqual(b.amount_money, { amount: 2500, currency: 'USD' });
      assert.equal(b.idempotency_key, requestKey('ref_1:refund'));
      assert.equal(b.reason, 'duplicate');
      assert.ok(String(b.idempotency_key).length <= 45);
      return {
        body: {
          refund: {
            id: 'REF123456789',
            status: 'PENDING',
            amount_money: { amount: 2500, currency: 'USD' },
            payment_id: PAY,
          },
        },
      };
    });
    const pending = await adapter.refund(ctx, {
      idempotencyKey: 'ref_1:refund',
      processorTransactionId: PAY,
      amount: Money.parse('25'),
      reason: 'duplicate',
    });
    assert.deepEqual([pending.status, pending.processorTransactionId], ['pending', 'REF123456789']);
    route('POST /v2/refunds', {
      body: {
        refund: { id: 'R2', status: 'COMPLETED', amount_money: { amount: 2500, currency: 'USD' } },
      },
    });
    assert.equal(
      (
        await adapter.refund(ctx, {
          idempotencyKey: 'k',
          processorTransactionId: PAY,
          amount: Money.parse('25'),
          reason: null,
        })
      ).status,
      'refunded',
    );
    route('POST /v2/refunds', {
      body: {
        refund: { id: 'R3', status: 'REJECTED', amount_money: { amount: 2500, currency: 'USD' } },
      },
    });
    const rejected = await adapter.refund(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: PAY,
      amount: Money.parse('25'),
      reason: null,
    });
    assert.deepEqual([rejected.status, rejected.declineCategory], ['declined', 'processor_error']);
    route('POST /v2/refunds', failure('REFUND_ERROR', 'REFUND_AMOUNT_INVALID'));
    const invalid = await adapter.refund(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: PAY,
      amount: Money.parse('999'),
      reason: null,
    });
    assert.deepEqual([invalid.status, invalid.rawCode], ['declined', 'REFUND_AMOUNT_INVALID']);
  });

  await check('status lookup', async () => {
    const states: [string, Json, string][] = [
      ['APPROVED', {}, 'authorized'],
      ['COMPLETED', {}, 'captured'],
      ['COMPLETED', { refunded_money: { amount: 2500, currency: 'USD' } }, 'captured'],
      ['COMPLETED', { refunded_money: { amount: 12050, currency: 'USD' } }, 'refunded'],
      ['CANCELED', {}, 'voided'],
      ['PENDING', {}, 'pending'],
      ['FAILED', {}, 'declined'],
      ['SOMETHING_NEW', {}, 'error'],
    ];
    for (const [status, over, mapped] of states) {
      route(`GET /v2/payments/${PAY}`, { body: { payment: payment(status, over) } });
      assert.equal(
        (await adapter.getTransaction(ctx, PAY)).status,
        mapped,
        `${status} ${JSON.stringify(over)}`,
      );
    }
    route(`GET /v2/payments/${PAY}`, {
      status: 404,
      body: { errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'NOT_FOUND' }] },
    });
    await assert.rejects(adapter.getTransaction(ctx, PAY), ValidationError);
  });

  await check('connection test', async () => {
    const location = (over: Json = {}): Json => ({
      id: 'LHJ4TESTLOC01',
      status: 'ACTIVE',
      currency: 'USD',
      capabilities: ['CREDIT_CARD_PROCESSING'],
      ...over,
    });
    route('GET /v2/locations/LHJ4TESTLOC01', { body: { location: location() } });
    assert.equal((await adapter.testConnection(ctx)).ok, true);
    route('GET /v2/locations/LHJ4TESTLOC01', { body: { location: location({ currency: 'CAD' }) } });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    route('GET /v2/locations/LHJ4TESTLOC01', {
      body: { location: location({ capabilities: [] }) },
    });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    route('GET /v2/locations/LHJ4TESTLOC01', {
      body: { location: location({ status: 'INACTIVE' }) },
    });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    route('GET /v2/locations/LHJ4TESTLOC01', failure('INVALID_REQUEST_ERROR', 'NOT_FOUND', 404));
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    route('GET /v2/locations/LHJ4TESTLOC01', failure('AUTHENTICATION_ERROR', 'UNAUTHORIZED', 401));
    const bad = await adapter.testConnection(ctx);
    assert.equal(bad.ok, false);
    assert.ok(!bad.message.includes('EAAA'));
    route('GET /v2/locations/LHJ4TESTLOC01', { status: 503, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
  });

  await check('webhook verification (HMAC-SHA-256 over URL + raw body, Base64)', async () => {
    const raw = '{"type":"payment.updated","event_id":"e1"}';
    const ok = (headers: Record<string, string>, body = raw, c = ctx): Promise<boolean> =>
      adapter.verifyWebhook(c, { headers, rawBody: body });
    assert.equal(await ok({ 'x-square-hmacsha256-signature': signed(raw) }), true);
    assert.equal(await ok({ 'x-square-hmacsha256-signature': signed(raw, 'other-key') }), false);
    assert.equal(
      await ok({
        'x-square-hmacsha256-signature': signed(raw, undefined, 'https://evil.example.com/x'),
      }),
      false,
    );
    assert.equal(await ok({ 'x-square-hmacsha256-signature': signed(raw) }, `${raw} `), false);
    assert.equal(await ok({}), false);
    assert.equal(await ok({ 'x-square-hmacsha256-signature': signed('') }, ''), false);
    assert.equal(
      await ok({ 'x-square-hmacsha256-signature': signed(raw) }, raw, { ...ctx, credentials: {} }),
      false,
    );
    assert.equal(seen.length, 0);
  });

  await check('webhook events', () => {
    const parse = (event: Json): ReturnType<typeof adapter.parseWebhook> =>
      adapter.parseWebhook({
        headers: {},
        rawBody: JSON.stringify({ event_id: 'E1', created_at: '2026-10-17T10:00:00Z', ...event }),
      });
    const pay = (status: string): Json => ({
      type: 'payment.updated',
      data: { type: 'payment', id: PAY, object: { payment: { id: PAY, status } } },
    });
    const expected: [string, string][] = [
      ['APPROVED', 'payment.authorized'],
      ['COMPLETED', 'payment.captured'],
      ['CANCELED', 'payment.voided'],
      ['FAILED', 'payment.failed'],
      ['PENDING', 'unknown'],
    ];
    for (const [status, type] of expected) {
      const event = parse(pay(status));
      assert.deepEqual(
        [event.type, event.processorTransactionId, event.eventId],
        [type, PAY, 'E1'],
        status,
      );
      assert.equal(event.occurredAt, '2026-10-17T10:00:00.000Z');
      assert.equal(event.processorId, 'square');
    }
    assert.equal(parse({ ...pay('COMPLETED'), type: 'payment.created' }).type, 'payment.captured');
    const refund = (status: string): Json => ({
      type: 'refund.updated',
      data: { object: { refund: { id: 'RF1', status, payment_id: PAY } } },
    });
    const refunded = parse(refund('COMPLETED'));
    assert.deepEqual(
      [refunded.type, refunded.processorTransactionId, refunded.payload.refundId],
      ['payment.refunded', PAY, 'RF1'],
    );
    assert.equal(parse(refund('PENDING')).type, 'unknown');
    assert.equal(parse(refund('FAILED')).payload.refundStatus, 'FAILED');
    const dispute = (type: string, state: string): Json => ({
      type,
      data: {
        id: 'D1',
        object: { object: { id: 'D1', state, disputed_payment: { payment_id: PAY } } },
      },
    });
    const opened = parse(dispute('dispute.created', 'EVIDENCE_REQUIRED'));
    assert.deepEqual(
      [opened.type, opened.processorTransactionId, opened.payload.disputeId],
      ['dispute.opened', PAY, 'D1'],
    );
    assert.equal(parse(dispute('dispute.state.updated', 'PROCESSING')).type, 'dispute.updated');
    for (const state of ['WON', 'LOST', 'ACCEPTED'])
      assert.equal(parse(dispute('dispute.state.updated', state)).type, 'dispute.closed');
    assert.equal(
      parse(dispute('dispute.evidence.created', 'EVIDENCE_REQUIRED')).type,
      'dispute.updated',
    );
    assert.equal(parse({ type: 'customer.created', data: {} }).type, 'unknown');
    assert.throws(() => adapter.parseWebhook({ headers: {}, rawBody: 'x' }));
  });

  setTransportForVerification(null);
  process.stdout.write(`step11-square: ${checks} checks passed\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
