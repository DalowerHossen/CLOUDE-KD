// path: scripts/verify/step11-bluesnap.ts
// Checks the BlueSnap adapter against a local fake transport that answers with the response shapes of BlueSnap's
// Developer Hub pages (docs/processors/bluesnap.md). It does NOT replace the sandbox run listed in
// docs/processors/bluesnap.verify.md. Run: npx tsx --conditions=react-server scripts/verify/step11-bluesnap.ts
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { adapter, bluesnapValue } from '@/lib/payment/adapters/bluesnap';
import { requestKey } from '@/lib/payment/adapters/bluesnap/api';
import { avsPostal, cardIdentity, readThreeDs } from '@/lib/payment/adapters/bluesnap/mapping';
import { adapterProblems } from '@/lib/payment/capabilities';
import {
  setTransportForVerification,
  type HttpRequest,
  type HttpResponse,
} from '@/lib/payment/http-client';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, AuthorizeInput } from '@/types/contracts';

const ctx: AdapterContext = {
  credentials: { apiUsername: 'API_16196282354892', apiPassword: 'Secret-Passw0rd!x' },
  environment: 'sandbox',
  mode: 'hosted_fields',
  correlationId: 'c1',
};
const TX = '1011671985';
const TOKEN = '812f6ee706e463d3276e3abeb21fa94072e40695ed423ddac244409b3b652eff_';
const input: AuthorizeInput = {
  idempotencyKey: 'a3c1f2d4-1111-4222-8333-444455556666:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'inv-uuid-1',
  companyId: 'co',
  paymentToken: TOKEN,
  billing: { postalCode: '02453', country: 'US' },
  payerIp: '203.0.113.5',
  returnUrl: 'https://app.example.com/pay/x',
  threeDS: 'preferred',
  metadata: {},
};

type Json = Record<string, unknown>;
type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
const seen: HttpRequest[] = [];
let routes = new Map<string, Reply | ((r: HttpRequest) => Reply)>();
const route = (key: string, reply: Reply | ((r: HttpRequest) => Reply)): void =>
  void routes.set(key, reply);
setTransportForVerification(async (request): Promise<HttpResponse> => {
  seen.push(request);
  const found = routes.get(`${request.method} ${new URL(request.url).pathname}`);
  if (!found) return { status: 404, text: '{}', headers: {} };
  const reply = typeof found === 'function' ? found(request) : found;
  return {
    status: reply.status ?? 200,
    text: reply.body === undefined ? '' : JSON.stringify(reply.body),
    headers: reply.headers ?? {},
  };
});

const transaction = (
  type: string,
  over: Json = {},
  processing: Json = {},
  card: Json = {},
): Json => ({
  amount: 120.5,
  currency: 'USD',
  cardTransactionType: type,
  transactionId: Number(TX),
  processingInfo: {
    processingStatus: 'SUCCESS',
    avsResponseCodeZip: 'M',
    avsResponseCodeAddress: 'U',
    cvvResponseCode: 'MA',
    ...processing,
  },
  creditCard: { cardLastFourDigits: 9299, cardType: 'VISA', binNumber: '411111', ...card },
  threeDSecure: { authenticationResult: 'AUTHENTICATION_SUCCEEDED' },
  ...over,
});
const failure = (errorName: string, code = 14002, status = 400): Reply => ({
  status,
  body: { message: [{ errorName, code, description: 'd' }] },
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
const sessionInput = {
  idempotencyKey: 'link:session:1',
  amount: Money.parse('120.5'),
  invoiceId: 'inv',
  companyId: 'co',
  returnUrl: 'https://app.example.com/x',
  threeDS: 'preferred' as const,
};

async function main(): Promise<void> {
  await check('contract is complete', () => {
    assert.deepEqual(adapterProblems(adapter), []);
    assert.deepEqual(
      adapter.credentialFields.map((f) => [f.key, f.secret]),
      [
        ['apiUsername', false],
        ['apiPassword', true],
      ],
    );
    assert.equal(adapter.capabilities.supportsThreeDS, true);
  });

  await check('value formatting and request key', () => {
    assert.equal(bluesnapValue(Money.parse('120.5')), '120.50');
    assert.equal(bluesnapValue(Money.parse('0.07')), '0.07');
    const key = requestKey(input.idempotencyKey);
    assert.match(key, /^[0-9a-f]{40}$/);
    assert.equal(key, createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 40));
  });

  await check('checkout session: token from the Location header, public data only', async () => {
    route('POST /services/2/payment-fields-tokens', {
      status: 201,
      headers: {
        location: `https://sandbox.bluesnap.com/services/2/payment-fields-tokens/${TOKEN}`,
      },
    });
    const session = await adapter.createCheckoutSession(ctx, sessionInput);
    const request = seen[0];
    assert.equal(request?.url, 'https://sandbox.bluesnap.com/services/2/payment-fields-tokens');
    assert.equal(
      request?.headers.authorization,
      `Basic ${Buffer.from('API_16196282354892:Secret-Passw0rd!x').toString('base64')}`,
    );
    assert.equal(request?.headers['bluesnap-version'], '3.0');
    assert.deepEqual(session.clientConfig, {
      pfToken: TOKEN,
      scriptUrl: 'https://sandpay.bluesnap.com/web-sdk/5/bluesnap.js',
      environment: 'sandbox',
      amount: '120.50',
      threeDS: 'preferred',
    });
    assert.ok(!JSON.stringify(session).includes('Secret-Passw0rd'));
    assert.ok(session.expiresAt !== null);
    route('POST /services/2/payment-fields-tokens', {
      status: 201,
      headers: { location: `https://ws.bluesnap.com/services/2/payment-fields-tokens/${TOKEN}` },
    });
    const live = await adapter.createCheckoutSession({ ...ctx, environment: 'live' }, sessionInput);
    assert.equal(
      seen[seen.length - 1]?.url,
      'https://ws.bluesnap.com/services/2/payment-fields-tokens',
    );
    assert.equal(live.clientConfig.scriptUrl, 'https://pay.bluesnap.com/web-sdk/5/bluesnap.js');
    route('POST /services/2/payment-fields-tokens', { status: 201, headers: {} });
    await assert.rejects(adapter.createCheckoutSession(ctx, sessionInput), /token not created/);
    route('POST /services/2/payment-fields-tokens', {
      status: 201,
      headers: { location: 'https://x/y/bad token!' },
    });
    await assert.rejects(adapter.createCheckoutSession(ctx, sessionInput), /token not created/);
    await assert.rejects(
      adapter.createCheckoutSession({ ...ctx, credentials: {} }, sessionInput),
      ValidationError,
    );
  });

  await check('authorize: request as documented, result mapped', async () => {
    route('POST /services/2/transactions', (r) => {
      const b = bodyOf(r);
      assert.equal(r.headers['idempotency-key'], requestKey(input.idempotencyKey));
      assert.equal(b.cardTransactionType, 'AUTH_ONLY');
      assert.equal(b.amount, 120.5);
      assert.equal(b.currency, 'USD');
      assert.equal(b.pfToken, TOKEN);
      assert.equal(b.storeCard, false);
      assert.equal(b.transactionInitiator, 'SHOPPER');
      assert.match(String(b.merchantTransactionId), /^[A-Za-z0-9-]{1,50}$/);
      assert.deepEqual(b.cardHolderInfo, { zip: '02453', country: 'US' });
      assert.equal(b.creditCard, undefined);
      return { body: transaction('AUTH_ONLY') };
    });
    const result = await adapter.authorize(ctx, input);
    assert.equal(result.status, 'authorized');
    assert.equal(result.processorTransactionId, TX);
    assert.ok(result.amount.eq('120.50'));
    assert.equal(result.avsPostalCodeMatch, true);
    assert.deepEqual(result.cardIdentity, { type: 'fingerprint', value: '411111|9299|VISA' });
    assert.deepEqual(result.threeDS, {
      requested: true,
      completed: true,
      authenticated: true,
      liabilityShift: true,
    });
  });

  await check('authorize: no postal code, 3DS off, processing status case and review', async () => {
    route('POST /services/2/transactions', (r) => {
      assert.equal(bodyOf(r).cardHolderInfo, undefined);
      return {
        body: transaction(
          'AUTH_ONLY',
          { threeDSecure: undefined },
          { processingStatus: 'success' },
          { binNumber: undefined },
        ),
      };
    });
    const result = await adapter.authorize(ctx, {
      ...input,
      billing: { postalCode: null, country: null },
      threeDS: 'disabled',
    });
    assert.equal(result.status, 'authorized');
    assert.equal(result.cardIdentity, null);
    assert.deepEqual(result.threeDS, {
      requested: false,
      completed: false,
      authenticated: false,
      liabilityShift: null,
    });
    route('POST /services/2/transactions', {
      body: transaction('AUTH_ONLY', {}, { processingStatus: 'PENDING_MERCHANT_REVIEW' }),
    });
    const held = await adapter.authorize(ctx, input);
    assert.deepEqual(
      [held.status, held.rawCode, held.processorTransactionId],
      ['pending', 'PENDING_MERCHANT_REVIEW', TX],
    );
    route('POST /services/2/transactions', {
      body: transaction('AUTH_ONLY', {}, { processingStatus: 'FAIL' }),
    });
    assert.equal((await adapter.authorize(ctx, input)).status, 'error');
  });

  await check('declines by error name', async () => {
    const expected: [string, string][] = [
      ['INSUFFICIENT_FUNDS', 'insufficient_funds'],
      ['INSUFFICENT_FUNDS', 'insufficient_funds'],
      ['INVALID_CARD_NUMBER', 'invalid_number'],
      ['EXPIRED_CARD', 'invalid_expiry'],
      ['CVV_ERROR', 'invalid_cvv'],
      ['THREE_D_SECURITY_AUTHENTICATION_REQUIRED', 'three_ds_failed'],
      ['STRONG_CUSTOMER_AUTHENTICATION_REQUIRED', 'three_ds_failed'],
      ['THREE_D_SECURE_FAILURE', 'three_ds_failed'],
      ['CARD_LOST_OR_STOLEN', 'processor_fraud_signal'],
      ['HIGH_RISK_ERROR', 'processor_fraud_signal'],
      ['FRAUD_DETECTED', 'processor_fraud_signal'],
      ['DO_NOT_HONOR', 'do_not_honor'],
      ['PROCESSING_GENERAL_DECLINE', 'do_not_honor'],
      ['GENERAL_PAYMENT_PROCESSING_ERROR', 'processor_error'],
      ['PROCESSING_TIMEOUT', 'processor_error'],
      ['PROCESSING_DUPLICATE', 'other'],
      ['AUTHORIZATION_EXPIRED', 'other'],
      ['EXPIRED_TOKEN', 'other'],
    ];
    for (const [name, category] of expected) {
      route('POST /services/2/transactions', failure(name));
      const result = await adapter.authorize(ctx, input);
      assert.equal(result.status, 'declined', name);
      assert.equal(result.declineCategory, category, name);
      assert.equal(result.rawCode, name);
      assert.ok(result.amount.eq('120.50'));
      assert.equal(adapter.mapDecline({ code: name, message: null }), category);
    }
    route('POST /services/2/transactions', failure('PAYMENT_GENERAL_FAILURE', 10000, 422));
    assert.equal((await adapter.authorize(ctx, input)).status, 'declined');
  });

  await check('credentials, permissions and outages', async () => {
    route('POST /services/2/transactions', { status: 401, body: {} });
    await assert.rejects(adapter.authorize(ctx, input), ValidationError);
    route('POST /services/2/transactions', { status: 403, body: {} });
    await assert.rejects(adapter.authorize(ctx, input), ValidationError);
    route('POST /services/2/transactions', failure('USER_NOT_AUTHORIZED', 24012, 403));
    assert.equal((await adapter.authorize(ctx, input)).status, 'declined');
    for (const status of [409, 429, 500, 503]) {
      route('POST /services/2/transactions', { status, body: {} });
      await assert.rejects(adapter.authorize(ctx, input), /unavailable/, String(status));
    }
    await assert.rejects(adapter.authorize({ ...ctx, credentials: {} }, input), ValidationError);
    for (const token of [
      '',
      'short',
      'has space in token 0123456789',
      '../../etc/passwd0123456789',
    ]) {
      await assert.rejects(
        adapter.authorize(ctx, { ...input, paymentToken: token }),
        ValidationError,
        token,
      );
    }
  });

  await check('3D Secure reading from the transaction', () => {
    const read = (result: string | null): ReturnType<typeof readThreeDs> =>
      readThreeDs(result ? { threeDSecure: { authenticationResult: result } } : {}, true);
    assert.deepEqual(read('AUTHENTICATION_SUCCEEDED'), {
      requested: true,
      completed: true,
      authenticated: true,
      liabilityShift: true,
    });
    assert.deepEqual(read('AUTHENTICATION_FAILED'), {
      requested: true,
      completed: true,
      authenticated: false,
      liabilityShift: false,
    });
    assert.deepEqual(read('AUTHENTICATION_BYPASSED'), {
      requested: true,
      completed: true,
      authenticated: false,
      liabilityShift: false,
    });
    assert.deepEqual(read('AUTHENTICATION_UNAVAILABLE'), {
      requested: true,
      completed: true,
      authenticated: false,
      liabilityShift: false,
    });
    assert.deepEqual(read('AUTHENTICATION_INCOMPLETE'), {
      requested: true,
      completed: false,
      authenticated: false,
      liabilityShift: false,
    });
    assert.deepEqual(read(null), {
      requested: true,
      completed: false,
      authenticated: false,
      liabilityShift: null,
    });
    assert.equal(avsPostal('M'), true);
    assert.equal(avsPostal('N'), false);
    assert.equal(avsPostal('U'), null);
    assert.equal(avsPostal(null), null);
    assert.equal(cardIdentity(null), null);
    assert.equal(cardIdentity({ cardLastFourDigits: '1234', cardType: 'VISA' }), null);
    assert.deepEqual(
      cardIdentity({ binNumber: '411111', cardLastFourDigits: '0002', cardType: 'VISA' }),
      { type: 'fingerprint', value: '411111|0002|VISA' },
    );
  });

  await check('capture, including a partial amount', async () => {
    route('PUT /services/2/transactions', (r) => {
      const b = bodyOf(r);
      assert.deepEqual(b, { cardTransactionType: 'CAPTURE', transactionId: TX, amount: 100 });
      assert.equal(r.headers['idempotency-key'], requestKey('pay_1:capture'));
      return { body: transaction('CAPTURE', { amount: 100 }) };
    });
    const captured = await adapter.capture?.(ctx, {
      idempotencyKey: 'pay_1:capture',
      processorTransactionId: TX,
      amount: Money.parse('100'),
    });
    assert.equal(captured?.status, 'captured');
    assert.ok(captured?.amount.eq('100'));
    route('PUT /services/2/transactions', failure('TRANSACTION_ALREADY_CAPTURED', 20010));
    const again = await adapter.capture?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
      amount: Money.parse('100'),
    });
    assert.deepEqual(
      [again?.status, again?.declineCategory, again?.rawCode],
      ['declined', 'other', 'TRANSACTION_ALREADY_CAPTURED'],
    );
    assert.ok(again?.amount.eq('100'));
    await assert.rejects(
      adapter.capture?.(ctx, {
        idempotencyKey: 'k',
        processorTransactionId: '../x',
        amount: Money.parse('1'),
      }) ?? Promise.resolve(),
      ValidationError,
    );
  });

  await check('void (authorization reversal)', async () => {
    route('PUT /services/2/transactions', (r) => {
      assert.deepEqual(bodyOf(r), { cardTransactionType: 'AUTH_REVERSAL', transactionId: TX });
      return { body: transaction('AUTH_REVERSAL') };
    });
    assert.equal(
      (
        await adapter.voidAuthorization?.(ctx, {
          idempotencyKey: 'pay_1:void',
          processorTransactionId: TX,
        })
      )?.status,
      'voided',
    );
    route('PUT /services/2/transactions', failure('AUTHORIZATION_AMOUNT_ALREADY_REVERSED'));
    assert.equal(
      (await adapter.voidAuthorization?.(ctx, { idempotencyKey: 'k', processorTransactionId: TX }))
        ?.status,
      'voided',
    );
    route('PUT /services/2/transactions', failure('AUTHORIZATION_EXPIRED'));
    assert.equal(
      (await adapter.voidAuthorization?.(ctx, { idempotencyKey: 'k', processorTransactionId: TX }))
        ?.status,
      'declined',
    );
  });

  await check('refund: request as documented, statuses and refusals', async () => {
    route(`POST /services/2/transactions/refund/${TX}`, (r) => {
      const b = bodyOf(r);
      assert.deepEqual(b, { amount: 25, cancelSubscriptions: false, reason: 'duplicate' });
      assert.equal(r.headers['idempotency-key'], requestKey('ref_1:refund'));
      return {
        body: {
          amount: 25,
          currency: 'USD',
          refundStatus: 'SUCCESS',
          refundTransactionId: 1039287690,
        },
      };
    });
    const done = await adapter.refund(ctx, {
      idempotencyKey: 'ref_1:refund',
      processorTransactionId: TX,
      amount: Money.parse('25'),
      reason: 'duplicate',
    });
    assert.deepEqual([done.status, done.processorTransactionId], ['refunded', '1039287690']);
    route(`POST /services/2/transactions/refund/${TX}`, {
      body: { amount: 25, refundStatus: 'PENDING', refundTransactionId: 7 },
    });
    assert.equal(
      (
        await adapter.refund(ctx, {
          idempotencyKey: 'k',
          processorTransactionId: TX,
          amount: Money.parse('25'),
          reason: null,
        })
      ).status,
      'pending',
    );
    route(`POST /services/2/transactions/refund/${TX}`, {
      body: { amount: 25, refundStatus: 'FAILED', refundTransactionId: 8 },
    });
    const failed = await adapter.refund(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
      amount: Money.parse('25'),
      reason: null,
    });
    assert.deepEqual([failed.status, failed.declineCategory], ['declined', 'processor_error']);
    route(`POST /services/2/transactions/refund/${TX}`, failure('REFUND_GENERAL_FAILURE', 14004));
    const early = await adapter.refund(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
      amount: Money.parse('25'),
      reason: null,
    });
    assert.deepEqual([early.status, early.rawCode], ['declined', 'REFUND_GENERAL_FAILURE']);
    assert.ok(early.amount.eq('25'));
  });

  await check('status lookup', async () => {
    const states: [string, Json, string][] = [
      ['AUTH_ONLY', {}, 'authorized'],
      ['AUTH_CAPTURE', {}, 'captured'],
      ['CAPTURE', {}, 'captured'],
      ['AUTH_REVERSAL', {}, 'voided'],
      ['AUTH_ONLY', { processingInfo: { processingStatus: 'PENDING_MERCHANT_REVIEW' } }, 'pending'],
      ['AUTH_ONLY', { processingInfo: { processingStatus: 'FAIL' } }, 'error'],
      ['SOMETHING_NEW', {}, 'error'],
    ];
    for (const [type, over, mapped] of states) {
      route(`GET /services/2/transactions/${TX}`, { body: transaction(type, over) });
      assert.equal(
        (await adapter.getTransaction(ctx, TX)).status,
        mapped,
        `${type} ${JSON.stringify(over)}`,
      );
    }
    route(`GET /services/2/transactions/${TX}`, failure('INVALID_TRANSACTION_ID', 20009, 404));
    await assert.rejects(adapter.getTransaction(ctx, TX), ValidationError);
    await assert.rejects(adapter.getTransaction(ctx, 'abc'), ValidationError);
  });

  await check('connection test', async () => {
    route('POST /services/2/payment-fields-tokens', {
      status: 201,
      headers: {
        location: `https://sandbox.bluesnap.com/services/2/payment-fields-tokens/${TOKEN}`,
      },
    });
    assert.equal((await adapter.testConnection(ctx)).ok, true);
    route('POST /services/2/payment-fields-tokens', { status: 403, body: {} });
    const denied = await adapter.testConnection(ctx);
    assert.equal(denied.ok, false);
    assert.match(denied.message, /Authorized IPs/);
    route('POST /services/2/payment-fields-tokens', { status: 401, body: {} });
    const bad = await adapter.testConnection(ctx);
    assert.equal(bad.ok, false);
    assert.ok(!bad.message.includes('Secret-Passw0rd'));
    route('POST /services/2/payment-fields-tokens', { status: 503, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
  });

  await check('webhooks fail closed until blocker B1 is resolved', async () => {
    const body = 'transactionType=CHARGE&invoiceAmount=30.00&referenceNumber=1011310133';
    assert.equal(
      await adapter.verifyWebhook(ctx, {
        headers: { 'bls-signature': 'abcd', 'bls-ipn-timestamp': '2026-10-17 10:00:00.000' },
        rawBody: body,
      }),
      false,
    );
    assert.equal(await adapter.verifyWebhook(ctx, { headers: {}, rawBody: body }), false);
    const event = adapter.parseWebhook({ headers: {}, rawBody: body });
    assert.deepEqual(
      [event.type, event.processorTransactionId, event.processorId],
      ['unknown', null, 'bluesnap'],
    );
    assert.match(event.eventId, /^bs_[0-9a-f]{64}$/);
    assert.equal(event.eventId, adapter.parseWebhook({ headers: {}, rawBody: body }).eventId);
    assert.equal(event.payload.bluesnapTransactionType, 'CHARGE');
    assert.equal(seen.length, 0);
  });

  setTransportForVerification(null);
  process.stdout.write(`step11-bluesnap: ${checks} checks passed\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
