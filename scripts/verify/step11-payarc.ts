// path: scripts/verify/step11-payarc.ts
// Checks the PayArc adapter against a local fake transport that answers with the response shapes of PayArc's OpenAPI
// definitions and documentation (docs/processors/payarc.md). It does NOT replace the sandbox run listed in
// docs/processors/payarc.verify.md. Run: npx tsx --conditions=react-server scripts/verify/step11-payarc.ts
import assert from 'node:assert/strict';
import { ValidationError } from '@/lib/errors';
import { adapter } from '@/lib/payment/adapters/payarc';
import { requestKey } from '@/lib/payment/adapters/payarc/api';
import { avsPostal, cardIdentity, fromCharge } from '@/lib/payment/adapters/payarc/mapping';
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
    clientId: 'client-id-0123456789',
    accessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.testtoken',
  },
  environment: 'sandbox',
  mode: 'hosted_fields',
  correlationId: 'c1',
};
const CH = 'nBoLWODLMLLoOXyb';
const input: AuthorizeInput = {
  idempotencyKey: 'a3c1f2d4-1111-4222-8333-444455556666:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'inv-uuid-1',
  companyId: 'co',
  paymentToken: '8YmNlwY0qY0mwEq0',
  billing: { postalCode: '85284', country: 'US' },
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
  if (!found) return { status: 404, text: '{"message":"not found"}', headers: {} };
  const reply = typeof found === 'function' ? found(request) : found;
  return { status: reply.status ?? 200, text: JSON.stringify(reply.body), headers: {} };
});

const card = (over: Json = {}): Json => ({
  data: {
    object: 'Card',
    id: '2mMPL029yyP50vyN',
    fingerprint: '9v09mPMLP5NMNM0m',
    brand: 'V',
    last4digit: '5439',
    first6digit: 401200,
    exp_month: '12',
    exp_year: '2029',
    avs_status: '0',
    cvc_status: 'M',
    address_check_passed: 0,
    zip_check_passed: 1,
    ...over,
  },
});
const charge = (status: string, over: Json = {}): Json => ({
  data: {
    object: 'Charge',
    id: CH,
    amount: 12050,
    amount_captured: status === 'authorized' ? 0 : '12050',
    amount_refunded: 0,
    amount_voided: 0,
    captured: status === 'authorized' ? 0 : 1,
    status,
    auth_code: 'TAS712',
    failure_code: null,
    failure_message: null,
    refund: { data: [] },
    card: card(),
    ...over,
  },
  meta: { include: [], custom: [] },
});
const bodyOf = (r: HttpRequest | undefined): Json => JSON.parse(r?.body ?? '{}') as Json;
const callsTo = (suffix: string): HttpRequest[] =>
  seen.filter((r) => new URL(r.url).pathname.endsWith(suffix));

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
const ids = { processorTransactionId: CH, idempotencyKey: 'k' };

async function main(): Promise<void> {
  await check('contract is complete', () => {
    assert.deepEqual(adapterProblems(adapter), []);
    assert.deepEqual(
      adapter.credentialFields.map((f) => [f.key, f.secret]),
      [
        ['clientId', false],
        ['accessToken', true],
      ],
    );
    assert.equal(adapter.capabilities.supportsThreeDS, false);
    assert.deepEqual(adapter.capabilities.currencies, ['USD']);
    for (const field of adapter.credentialFields)
      if (field.pattern)
        assert.ok(new RegExp(field.pattern).test(ctx.credentials[field.key] ?? ''), field.key);
  });

  await check(
    'checkout session: public data only; live refused until the address is known',
    async () => {
      const session = await adapter.createCheckoutSession(ctx, {
        idempotencyKey: 'k',
        amount: input.amount,
        invoiceId: 'inv-uuid-1',
        companyId: 'co',
        returnUrl: input.returnUrl,
        threeDS: 'disabled',
      });
      assert.deepEqual(session.clientConfig, {
        clientId: 'client-id-0123456789',
        scriptUrl: 'https://testportal.payarc.net/js/iframeprocess.js',
        amount: '120.50',
      });
      assert.ok(!JSON.stringify(session).includes(ctx.credentials.accessToken ?? 'x'));
      assert.equal(seen.length, 0);
      const live = { ...ctx, environment: 'live' as const };
      await assert.rejects(
        adapter.createCheckoutSession(live, {
          idempotencyKey: 'k',
          amount: input.amount,
          invoiceId: 'i',
          companyId: 'co',
          returnUrl: input.returnUrl,
          threeDS: 'disabled',
        }),
        ValidationError,
      );
      await assert.rejects(
        adapter.createCheckoutSession(
          { ...ctx, credentials: { ...ctx.credentials, clientId: '' } },
          {
            idempotencyKey: 'k',
            amount: input.amount,
            invoiceId: 'i',
            companyId: 'co',
            returnUrl: input.returnUrl,
            threeDS: 'disabled',
          },
        ),
        ValidationError,
      );
    },
  );

  await check('request key is a fixed 40 character digest', () => {
    assert.match(requestKey('a3c1f2d4-1111-4222-8333-444455556666:authorize'), /^[0-9a-f]{40}$/);
    assert.equal(requestKey('x'), requestKey('x'));
    assert.notEqual(requestKey('x'), requestKey('y'));
  });

  await check('authorize: exact request and result', async () => {
    route('POST /v1/charges', { status: 201, body: charge('authorized') });
    const result = await adapter.authorize(ctx, input);
    assert.equal(result.status, 'authorized');
    assert.equal(result.processorTransactionId, CH);
    assert.ok(result.amount.eq('120.50'));
    assert.deepEqual(result.cardIdentity, {
      type: 'fingerprint',
      value: '9v09mPMLP5NMNM0m',
      last4: '5439',
      brand: 'v',
    });
    assert.equal(result.avsPostalCodeMatch, true);
    assert.deepEqual(result.threeDS, {
      requested: false,
      completed: false,
      authenticated: false,
      liabilityShift: null,
    });
    const request = seen[0];
    assert.equal(request?.url, 'https://testapi.payarc.net/v1/charges');
    assert.equal(request?.headers.authorization, `Bearer ${ctx.credentials.accessToken}`);
    assert.equal(request?.headers['idempotency-key'], requestKey(input.idempotencyKey));
    assert.deepEqual(bodyOf(request), {
      amount: 12050,
      currency: 'usd',
      token_id: '8YmNlwY0qY0mwEq0',
      capture: 0,
      metadata: '{"invoice":"inv-uuid-1"}',
    });
    assert.equal(adapter.cardIdentity(result)?.value, '9v09mPMLP5NMNM0m');
  });

  await check('authorize: refusals before any call and request errors', async () => {
    for (const bad of ['', '../x', 'short', 'tok en tok en']) {
      await assert.rejects(
        adapter.authorize(ctx, { ...input, paymentToken: bad }),
        ValidationError,
      );
    }
    assert.equal(seen.length, 0);
    route('POST /v1/charges', { status: 401, body: { error: 'Unauthenticated.' } });
    const failure = await adapter.authorize(ctx, input).catch((e: unknown) => e);
    assert.ok(failure instanceof ValidationError);
    assert.ok(!(failure as Error).message.includes(ctx.credentials.accessToken ?? 'x'));
    route('POST /v1/charges', { status: 503, body: {} });
    await assert.rejects(adapter.authorize(ctx, input), /unavailable/);
    route('POST /v1/charges', { status: 429, body: {} });
    await assert.rejects(adapter.authorize(ctx, input), /unavailable/);
    route('POST /v1/charges', {
      status: 422,
      body: {
        message: 'The given data was invalid.',
        errors: { amount: ['The amount field is required.'] },
      },
    });
    const invalid = await adapter.authorize(ctx, input);
    assert.deepEqual(
      [invalid.status, invalid.rawCode, invalid.declineCategory],
      ['declined', 'VALIDATION', 'other'],
    );
  });

  await check('authorize: declines map to platform categories', async () => {
    const cases: [string, string, string][] = [
      ['D2020', 'CVV2 verification failed', 'invalid_cvv'],
      ['D2012', 'Insufficient Funds', 'insufficient_funds'],
      ['D2011', 'Expired Card', 'invalid_expiry'],
      ['D2005', 'Invalid Card', 'invalid_number'],
      ['D2026', 'Do not honor', 'do_not_honor'],
      ['D2029', 'Suspected Fraud', 'processor_fraud_signal'],
      ['D1006', 'x', 'processor_error'],
      ['D0003', 'Duplicate', 'other'],
    ];
    for (const [code, message, category] of cases) {
      route('POST /v1/charges', {
        status: 201,
        body: charge('Declined', { failure_code: code, failure_message: message, auth_code: null }),
      });
      const result = await adapter.authorize(ctx, input);
      assert.deepEqual(
        [result.status, result.declineCategory, result.rawCode],
        ['declined', category, code],
        code,
      );
    }
    // a refusal as an HTTP error with only a message
    route('POST /v1/charges', { status: 409, body: { message: 'Do not honor' } });
    const byMessage = await adapter.authorize(ctx, input);
    assert.deepEqual([byMessage.status, byMessage.declineCategory], ['declined', 'do_not_honor']);
    route('POST /v1/charges', { status: 201, body: charge('failed_by_gateway') });
    assert.equal((await adapter.authorize(ctx, input)).status, 'declined');
  });

  await check(
    'authorize: a charge that is not an authorization, and a partial approval',
    async () => {
      route('POST /v1/charges', { status: 201, body: charge('submitted_for_settlement') });
      assert.equal((await adapter.authorize(ctx, input)).status, 'captured');
      setup();
      route('POST /v1/charges', {
        status: 201,
        body: charge('authorized', { amount_approved: 5000 }),
      });
      route(`POST /v1/charges/${CH}/void`, { status: 201, body: charge('void') });
      const partial = await adapter.authorize(ctx, input);
      assert.deepEqual([partial.status, partial.rawCode], ['declined', 'AMOUNT_MISMATCH']);
      assert.equal(callsTo('/void').length, 1);
      setup();
      route('POST /v1/charges', { status: 201, body: charge('authorized', { amount: 5000 }) });
      route(`POST /v1/charges/${CH}/void`, { status: 201, body: charge('void') });
      assert.equal((await adapter.authorize(ctx, input)).rawCode, 'AMOUNT_MISMATCH');
    },
  );

  await check('capture: full amount only, state read first', async () => {
    route(`GET /v1/charges/${CH}`, { body: charge('authorized') });
    route(`POST /v1/charges/${CH}/capture`, { body: charge('submitted_for_settlement') });
    const done = await adapter.capture?.(ctx, { ...ids, amount: input.amount });
    assert.equal(done?.status, 'captured');
    assert.deepEqual(bodyOf(callsTo('/capture')[0]), { amount: 12050 });
    setup();
    route(`GET /v1/charges/${CH}`, { body: charge('authorized') });
    const less = await adapter.capture?.(ctx, { ...ids, amount: Money.parse('100.00') });
    assert.equal(less?.rawCode, 'CAPTURE_AMOUNT_MISMATCH');
    assert.equal(callsTo('/capture').length, 0);
    setup();
    assert.equal(
      (await adapter.capture?.(ctx, { ...ids, amount: input.amount }))?.rawCode,
      'CHARGE_NOT_FOUND',
    );
    route(`GET /v1/charges/${CH}`, { body: charge('submitted_for_settlement') });
    const already = await adapter.capture?.(ctx, { ...ids, amount: input.amount });
    assert.equal(already?.status, 'captured');
    assert.equal(callsTo('/capture').length, 0);
    route(`GET /v1/charges/${CH}`, { body: charge('void') });
    assert.equal(
      (await adapter.capture?.(ctx, { ...ids, amount: input.amount }))?.rawCode,
      'CHARGE_NOT_CAPTURABLE',
    );
    await assert.rejects(
      Promise.resolve().then(() =>
        adapter.capture?.(ctx, { ...ids, processorTransactionId: '../x', amount: input.amount }),
      ),
      ValidationError,
    );
  });

  await check('capture: concurrent capture and unclear answers', async () => {
    let reads = 0;
    route(`GET /v1/charges/${CH}`, () => {
      reads += 1;
      return { body: charge(reads === 1 ? 'authorized' : 'submitted_for_settlement') };
    });
    route(`POST /v1/charges/${CH}/capture`, {
      status: 409,
      body: { message: 'Cannot initiate capture as charge is already captured' },
    });
    assert.equal(
      (await adapter.capture?.(ctx, { ...ids, amount: input.amount }))?.status,
      'captured',
    );
    setup();
    route(`GET /v1/charges/${CH}`, { body: charge('authorized') });
    route(`POST /v1/charges/${CH}/capture`, { body: charge('authorized') });
    assert.equal(
      (await adapter.capture?.(ctx, { ...ids, amount: input.amount }))?.status,
      'pending',
    );
    setup();
    route(`GET /v1/charges/${CH}`, { body: charge('authorized') });
    route(`POST /v1/charges/${CH}/capture`, {
      status: 404,
      body: { message: 'Charge Id does not exist' },
    });
    assert.equal(
      (await adapter.capture?.(ctx, { ...ids, amount: input.amount }))?.status,
      'declined',
    );
  });

  await check('void: only an uncaptured authorization', async () => {
    route(`GET /v1/charges/${CH}`, { body: charge('authorized') });
    route(`POST /v1/charges/${CH}/void`, { status: 201, body: charge('void') });
    const done = await adapter.voidAuthorization?.(ctx, ids);
    assert.equal(done?.status, 'voided');
    assert.deepEqual(Object.keys(bodyOf(callsTo('/void')[0])).sort(), [
      'reason',
      'void_description',
    ]);
    assert.ok(String(bodyOf(callsTo('/void')[0]).void_description).length >= 5);
    setup();
    route(`GET /v1/charges/${CH}`, { body: charge('void') });
    assert.equal((await adapter.voidAuthorization?.(ctx, ids))?.status, 'voided');
    assert.equal(callsTo('/void').length, 0);
    route(`GET /v1/charges/${CH}`, { body: charge('submitted_for_settlement') });
    assert.equal((await adapter.voidAuthorization?.(ctx, ids))?.rawCode, 'CHARGE_NOT_VOIDABLE');
    setup();
    route(`GET /v1/charges/${CH}`, { body: charge('authorized') });
    route(`POST /v1/charges/${CH}/void`, {
      status: 409,
      body: { message: 'Reversal Not Allowed.' },
    });
    assert.equal((await adapter.voidAuthorization?.(ctx, ids))?.status, 'declined');
  });

  await check('refund: batched charge, the refund object, refusals', async () => {
    const refundInput = {
      ...ids,
      amount: Money.parse('25.00'),
      reason: 'product could not be shipped',
    };
    route(`GET /v1/charges/${CH}`, { body: charge('submitted_for_settlement') });
    route(`POST /v1/charges/${CH}/refunds`, {
      body: charge('partial_refund', {
        refund: {
          data: [
            {
              object: 'Refund',
              id: 'old-refund-00001',
              refund_amount: 100,
              status: 'refunded',
              created_at: 1,
            },
            {
              object: 'Refund',
              id: 'v8q9YxbO1qxbYpBO',
              refund_amount: 2500,
              status: 'refunded',
              created_at: 5,
            },
          ],
        },
      }),
    });
    const refunded = await adapter.refund(ctx, refundInput);
    assert.deepEqual(
      [refunded.status, refunded.processorTransactionId],
      ['refunded', 'v8q9YxbO1qxbYpBO'],
    );
    assert.ok(refunded.amount.eq('25.00'));
    assert.deepEqual(bodyOf(callsTo('/refunds')[0]), {
      amount: 2500,
      reason: 'other',
      description: 'product could not be shipped',
    });
    // a Refund object as the answer, a failed refund, an answer without a list
    route(`POST /v1/charges/${CH}/refunds`, {
      body: {
        data: {
          object: 'Refund',
          id: 'xB8Pw1B8Ob9pYOp9',
          refund_amount: 2500,
          status: 'failed_by_gateway',
        },
      },
    });
    const failed = await adapter.refund(ctx, refundInput);
    assert.deepEqual([failed.status, failed.declineCategory], ['declined', 'processor_error']);
    route(`POST /v1/charges/${CH}/refunds`, { body: charge('refunded') });
    const bare = await adapter.refund(ctx, { ...refundInput, reason: null });
    assert.equal(bare.status, 'refunded');
    assert.equal(bare.processorTransactionId, CH);
    // not captured, too large, unknown
    setup();
    route(`GET /v1/charges/${CH}`, { body: charge('authorized') });
    assert.equal((await adapter.refund(ctx, refundInput)).rawCode, 'CHARGE_NOT_REFUNDABLE');
    route(`GET /v1/charges/${CH}`, { body: charge('submitted_for_settlement') });
    assert.equal(
      (await adapter.refund(ctx, { ...refundInput, amount: Money.parse('120.51') })).rawCode,
      'REFUND_AMOUNT_INVALID',
    );
    setup();
    assert.equal((await adapter.refund(ctx, refundInput)).rawCode, 'CHARGE_NOT_FOUND');
  });

  await check('refund before batching: full amount is a void, partial is refused', async () => {
    route(`GET /v1/charges/${CH}`, { body: charge('submitted_for_settlement') });
    route(`POST /v1/charges/${CH}/refunds`, {
      status: 422,
      body: { status: 'error', code: 0, message: 'Return Not Allowed.', status_code: 422 },
    });
    route(`POST /v1/charges/${CH}/void`, { status: 201, body: charge('void') });
    const whole = await adapter.refund(ctx, { ...ids, amount: input.amount, reason: null });
    assert.deepEqual([whole.status, whole.processorTransactionId], ['refunded', CH]);
    assert.equal(callsTo('/void').length, 1);
    seen.length = 0;
    const partial = await adapter.refund(ctx, {
      ...ids,
      amount: Money.parse('10.00'),
      reason: null,
    });
    assert.equal(partial.rawCode, 'REFUND_NOT_YET_SETTLED');
    assert.equal(callsTo('/void').length, 0);
    route(`POST /v1/charges/${CH}/void`, {
      status: 409,
      body: { message: 'Reversal Not Allowed.' },
    });
    assert.equal(
      (await adapter.refund(ctx, { ...ids, amount: input.amount, reason: null })).status,
      'declined',
    );
  });

  await check('charge states and card helpers', async () => {
    const state = (status: string, over: Json = {}): string =>
      fromCharge(charge(status, over).data as Json, null).status;
    assert.equal(state('authorized'), 'authorized');
    assert.equal(state('submitted_for_settlement'), 'captured');
    assert.equal(state('partial_refund'), 'captured');
    assert.equal(state('void'), 'voided');
    assert.equal(state('refunded'), 'refunded');
    assert.equal(state('failed_by_gateway'), 'declined');
    assert.equal(state('Invalid CVV', { failure_code: 'D2020' }), 'declined');
    assert.equal(state('something_new'), 'error');
    assert.equal(
      fromCharge(
        { id: CH, amount: 'bad', status: 'authorized' },
        Money.parse('3.00'),
      ).amount.toDbString(),
      '3.0000',
    );
    assert.deepEqual(cardIdentity(null), null);
    assert.deepEqual(cardIdentity(card({ fingerprint: undefined }).data as Json), {
      type: 'fingerprint',
      value: '401200|5439|V|12/2029',
      last4: '5439',
      brand: 'v',
    });
    assert.equal(
      cardIdentity(card({ fingerprint: undefined, last4digit: undefined }).data as Json),
      null,
    );
    assert.equal(avsPostal(card().data as Json), true);
    assert.equal(avsPostal(card({ zip_check_passed: 0, avs_status: 'N' }).data as Json), false);
    assert.equal(avsPostal(card({ zip_check_passed: 0, avs_status: '0' }).data as Json), null);
    assert.equal(avsPostal(null), null);
    route(`GET /v1/charges/${CH}`, { body: charge('submitted_for_settlement') });
    const tx = await adapter.getTransaction(ctx, CH);
    assert.equal(tx.status, 'captured');
    setup();
    await assert.rejects(adapter.getTransaction(ctx, CH), ValidationError);
  });

  await check('decline mapping', () => {
    const table: [string | null, string | null, string][] = [
      ['D2012', null, 'insufficient_funds'],
      ['DECLINED-051', null, 'insufficient_funds'],
      ['D2005', null, 'invalid_number'],
      ['D2011', null, 'invalid_expiry'],
      [null, 'Expired Card', 'invalid_expiry'],
      ['D2020', null, 'invalid_cvv'],
      ['D9099', null, 'three_ds_failed'],
      ['D2002', null, 'processor_fraud_signal'],
      ['D2026', null, 'do_not_honor'],
      ['DECLINED-005', null, 'do_not_honor'],
      ['RESTRICTED CARD', null, 'do_not_honor'],
      ['D0050', null, 'processor_error'],
      ['d2012', null, 'insufficient_funds'],
      ['D0001', null, 'other'],
      [null, null, 'other'],
    ];
    for (const [code, message, category] of table)
      assert.equal(adapter.mapDecline({ code, message }), category, `${code}/${message}`);
  });

  await check('connection test', async () => {
    route('GET /v1/charges', { body: { data: [] } });
    const ok = await adapter.testConnection(ctx);
    assert.equal(ok.ok, true);
    assert.equal(seen[0]?.url, 'https://testapi.payarc.net/v1/charges?limit=1');
    route('GET /v1/charges', { status: 401, body: { error: 'Unauthenticated.' } });
    const bad = await adapter.testConnection(ctx);
    assert.equal(bad.ok, false);
    assert.ok(!bad.message.includes(ctx.credentials.accessToken ?? 'x'));
    route('GET /v1/charges', { status: 503, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    route('GET /v1/charges', { status: 404, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    const live = { ...ctx, environment: 'live' as const };
    route('GET /v1/charges', { body: { data: [] } });
    seen.length = 0;
    await adapter.testConnection(live);
    assert.equal(seen[0]?.url, 'https://api.payarc.net/v1/charges?limit=1');
  });

  await check('webhooks fail closed', async () => {
    const body = JSON.stringify({
      request_payload: {},
      api_response: { original: { data: { object: 'Charge', id: CH } } },
      event_type: 'Charge Captured',
    });
    for (const headers of [{}, { 'x-signature': 'abc' }, { authorization: 'Bearer x' }] as Record<
      string,
      string
    >[])
      assert.equal(await adapter.verifyWebhook(ctx, { headers, rawBody: body }), false);
    assert.equal(await adapter.verifyWebhook(ctx, { headers: {}, rawBody: '' }), false);
    const event = adapter.parseWebhook({ headers: {}, rawBody: body });
    assert.deepEqual(
      [event.processorId, event.type, event.processorTransactionId, event.payload.payarcEvent],
      ['payarc', 'unknown', null, 'Charge Captured'],
    );
    assert.match(event.eventId, /^pa_[0-9a-f]{64}$/);
    assert.equal(adapter.parseWebhook({ headers: {}, rawBody: body }).eventId, event.eventId);
    assert.throws(() => adapter.parseWebhook({ headers: {}, rawBody: 'x' }));
    assert.equal(seen.length, 0);
  });

  setTransportForVerification(null);
  process.stdout.write(`step11-payarc: ${checks} checks passed\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
