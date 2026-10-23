// path: scripts/verify/step12-nmi.ts
// Checks the NMI adapter and its shared server module against a local fake transport that answers with the response
// shapes of NMI's REST API v5 definitions and documentation (docs/processors/nmi.md). It does NOT replace the sandbox run
// listed in docs/processors/nmi.verify.md. Run: npx tsx --conditions=react-server scripts/verify/step12-nmi.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { adapter } from '@/lib/payment/adapters/nmi';
import { avsPostal, cardIdentity, fromPayment } from '@/lib/payment/adapters/nmi/mapping';
import { decimalText, jsonWithAmounts } from '@/lib/payment/adapters/nmi/shared-server';
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
    privateKey: 'privatekey0123456789abcdef',
    tokenizationKey: 'KXypee-Vq3y2f-K6c7Dy-Wq92R5',
    webhookSigningKey: 'whsigningkey0123',
  },
  environment: 'sandbox',
  mode: 'collectjs',
  correlationId: 'c1',
};
const PAY = '1234560000';
const input: AuthorizeInput = {
  idempotencyKey: 'a3c1f2d4-1111-4222-8333-444455556666:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'inv-uuid-1',
  companyId: 'co',
  paymentToken: 'SW8eBa72-jkaqt9-xyuEX2-DC8qceRbe6z6',
  billing: { postalCode: '77777', country: 'US' },
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
  if (!found)
    return {
      status: 404,
      text: '{"type":"notFound","error_code":"E_NOT_FOUND","message":"Transaction not found"}',
      headers: {},
    };
  const reply = typeof found === 'function' ? found(request) : found;
  return { status: reply.status ?? 200, text: JSON.stringify(reply.body), headers: {} };
});

const MASKED = ['card', '_number'].join('');
const payment = (over: Json = {}, actions: Json[] = []): Json => ({
  object: 'transaction',
  id: PAY,
  type: 'cc',
  amount: '120.50',
  currency: 'USD',
  auth_code: '123456',
  avs_response: 'Y',
  cvv_response: 'M',
  status: 'pendingsettlement',
  response: '1',
  response_text: 'Approved',
  response_code: '100',
  payment_details: {
    [MASKED]: '411111******1111',
    card_exp: '1029',
    card_hash: 'hash-abc-123',
    card_type: 'Visa',
    card_bin: '411111',
  },
  actions,
  ...over,
});
const action = (type: string, amount = '120.50', success = true): Json => ({
  id: `a-${type}`,
  type,
  amount,
  success,
  response: '1',
});
const bodyOf = (r: HttpRequest | undefined): string => r?.body ?? '';
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
const ids = { processorTransactionId: PAY, idempotencyKey: 'k' };

async function main(): Promise<void> {
  await check('contract is complete, two modes, one default', () => {
    assert.deepEqual(adapterProblems(adapter), []);
    assert.deepEqual(
      adapter.capabilities.modes.map((m) => [m.id, m.isDefault]),
      [
        ['collectjs', true],
        ['payment_component', false],
      ],
    );
    assert.deepEqual(
      adapter.credentialFields.map((f) => [f.key, f.secret]),
      [
        ['privateKey', true],
        ['tokenizationKey', false],
        ['webhookSigningKey', true],
      ],
    );
    for (const field of adapter.credentialFields)
      if (field.pattern)
        assert.ok(new RegExp(field.pattern).test(ctx.credentials[field.key] ?? ''), field.key);
  });

  await check('amounts are printed as bare numbers from cents', () => {
    assert.equal(decimalText(Money.parse('120.5')), '120.50');
    assert.equal(decimalText(Money.parse('0.07')), '0.07');
    assert.equal(decimalText(Money.parse('1000')), '1000.00');
    const text = jsonWithAmounts(
      { currency: 'USD', nested: { a: 1 } },
      { amount: Money.parse('9.99') },
    );
    assert.equal(text, '{"currency":"USD","nested":{"a":1},"amount":9.99}');
    assert.equal((JSON.parse(text) as Json).amount, 9.99);
  });

  await check('checkout session: per mode, public data only; live refused', async () => {
    for (const mode of ['collectjs', 'payment_component']) {
      const session = await adapter.createCheckoutSession(
        { ...ctx, mode },
        {
          idempotencyKey: 'k',
          amount: input.amount,
          invoiceId: 'i',
          companyId: 'co',
          returnUrl: input.returnUrl,
          threeDS: 'disabled',
        },
      );
      assert.deepEqual(session.clientConfig, {
        tokenizationKey: 'KXypee-Vq3y2f-K6c7Dy-Wq92R5',
        mode,
        scriptUrl: 'https://sandbox.nmi.com/js/v1/Gateway.js',
      });
      assert.ok(!JSON.stringify(session).includes(ctx.credentials.privateKey ?? 'x'));
    }
    const make = (c: AdapterContext): ReturnType<typeof adapter.createCheckoutSession> =>
      adapter.createCheckoutSession(c, {
        idempotencyKey: 'k',
        amount: input.amount,
        invoiceId: 'i',
        companyId: 'co',
        returnUrl: input.returnUrl,
        threeDS: 'disabled',
      });
    await assert.rejects(make({ ...ctx, environment: 'live' }), ValidationError);
    await assert.rejects(make({ ...ctx, mode: 'other' }), ValidationError);
    await assert.rejects(
      make({ ...ctx, credentials: { ...ctx.credentials, tokenizationKey: '' } }),
      ValidationError,
    );
    assert.equal(seen.length, 0);
  });

  await check('connection test per mode', async () => {
    route('GET /api/v5/payments/kd-connection-check', {
      status: 404,
      body: { type: 'notFound', error_code: 'E_NOT_FOUND', message: 'Transaction not found' },
    });
    for (const mode of ['collectjs', 'payment_component']) {
      const result = await adapter.testConnection({ ...ctx, mode });
      assert.equal(result.ok, true);
      assert.equal(result.details?.mode, mode);
    }
    assert.equal(seen[0]?.headers.authorization, ctx.credentials.privateKey);
    assert.equal(seen[0]?.url, 'https://sandbox.nmi.com/api/v5/payments/kd-connection-check');
    route('GET /api/v5/payments/kd-connection-check', {
      status: 400,
      body: { type: 'validationError' },
    });
    assert.equal((await adapter.testConnection(ctx)).ok, true);
    route('GET /api/v5/payments/kd-connection-check', { status: 401, body: {} });
    const bad = await adapter.testConnection(ctx);
    assert.equal(bad.ok, false);
    assert.ok(!bad.message.includes(ctx.credentials.privateKey ?? 'x'));
    route('GET /api/v5/payments/kd-connection-check', { status: 503, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    route('GET /api/v5/payments/kd-connection-check', { status: 418, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    seen.length = 0;
    assert.equal((await adapter.testConnection({ ...ctx, mode: 'nope' })).ok, false);
    assert.equal(
      (
        await adapter.testConnection({
          ...ctx,
          credentials: { ...ctx.credentials, tokenizationKey: 'short' },
        })
      ).ok,
      false,
    );
    assert.equal((await adapter.testConnection({ ...ctx, environment: 'live' })).ok, false);
    assert.equal(seen.length, 0);
  });

  await check('authorize: exact request and result', async () => {
    route('POST /api/v5/payments/auth', { body: payment({}, [action('auth')]) });
    const result = await adapter.authorize(ctx, input);
    assert.equal(result.status, 'authorized');
    assert.equal(result.processorTransactionId, PAY);
    assert.ok(result.amount.eq('120.50'));
    assert.deepEqual(result.cardIdentity, { type: 'fingerprint', value: 'hash-abc-123' });
    assert.equal(result.avsPostalCodeMatch, true);
    assert.equal(result.rawCode, '100');
    assert.deepEqual(result.threeDS, {
      requested: false,
      completed: false,
      authenticated: false,
      liabilityShift: null,
    });
    const request = seen[0];
    assert.equal(request?.url, 'https://sandbox.nmi.com/api/v5/payments/auth');
    assert.equal(request?.headers.authorization, ctx.credentials.privateKey);
    assert.equal(request?.headers['idempotency-key'], undefined);
    assert.equal(
      bodyOf(request),
      '{"currency":"USD","payment_details":{"payment_token":"SW8eBa72-jkaqt9-xyuEX2-DC8qceRbe6z6"},"billing_address":{"zip":"77777","country":"US"},"order_details":{"order_id":"inv-uuid-1","ip_address":"203.0.113.5"},"amount":120.50}',
    );
    // billing and address omitted when unknown or invalid
    seen.length = 0;
    await adapter.authorize(ctx, {
      ...input,
      billing: { postalCode: null, country: null },
      payerIp: 'not-an-ip',
    });
    assert.equal(
      bodyOf(seen[0]),
      '{"currency":"USD","payment_details":{"payment_token":"SW8eBa72-jkaqt9-xyuEX2-DC8qceRbe6z6"},"order_details":{"order_id":"inv-uuid-1"},"amount":120.50}',
    );
    assert.equal(adapter.cardIdentity(result)?.value, 'hash-abc-123');
  });

  await check('authorize: refusals, declines and errors', async () => {
    for (const bad of ['', '../x', 'short', 'tok en tok en tok en']) {
      await assert.rejects(
        adapter.authorize(ctx, { ...input, paymentToken: bad }),
        ValidationError,
      );
    }
    assert.equal(seen.length, 0);
    const table: [string, string][] = [
      ['202', 'insufficient_funds'],
      ['220', 'invalid_number'],
      ['223', 'invalid_expiry'],
      ['225', 'invalid_cvv'],
      ['251', 'processor_fraud_signal'],
      ['201', 'do_not_honor'],
      ['420', 'processor_error'],
      ['430', 'other'],
    ];
    for (const [code, category] of table) {
      route('POST /api/v5/payments/auth', {
        body: payment({
          response: '2',
          response_text: 'DECLINE',
          response_code: code,
          avs_response: 'N',
        }),
      });
      const result = await adapter.authorize(ctx, input);
      assert.deepEqual(
        [result.status, result.declineCategory, result.rawCode],
        ['declined', category, code],
      );
    }
    route('POST /api/v5/payments/auth', { body: payment({ response: '3', response_code: '300' }) });
    assert.equal((await adapter.authorize(ctx, input)).status, 'error');
    route('POST /api/v5/payments/auth', {
      status: 400,
      body: { type: 'validationError', error_code: 'E_VALIDATION', message: 'bad' },
    });
    const invalid = await adapter.authorize(ctx, input);
    assert.deepEqual([invalid.status, invalid.rawCode], ['declined', 'validationError']);
    route('POST /api/v5/payments/auth', { status: 401, body: {} });
    const failure = await adapter.authorize(ctx, input).catch((e: unknown) => e);
    assert.ok(failure instanceof ValidationError);
    assert.ok(!(failure as Error).message.includes(ctx.credentials.privateKey ?? 'x'));
    route('POST /api/v5/payments/auth', { status: 500, body: {} });
    await assert.rejects(adapter.authorize(ctx, input), /unavailable/);
    route('POST /api/v5/payments/auth', { status: 429, body: {} });
    await assert.rejects(adapter.authorize(ctx, input), /unavailable/);
    await assert.rejects(
      adapter.authorize({ ...ctx, environment: 'live' }, input),
      ValidationError,
    );
    await assert.rejects(
      adapter.authorize({ ...ctx, credentials: { ...ctx.credentials, privateKey: '' } }, input),
      ValidationError,
    );
  });

  await check('authorize: a held amount that differs from the invoice is released', async () => {
    route('POST /api/v5/payments/auth', {
      body: payment({ amount: '99.99' }, [action('auth', '99.99')]),
    });
    route(`POST /api/v5/payments/${PAY}/void`, { body: payment({}, [action('void')]) });
    const result = await adapter.authorize(ctx, input);
    assert.deepEqual([result.status, result.rawCode], ['declined', 'AMOUNT_MISMATCH']);
    assert.equal(callsTo('/void').length, 1);
  });

  await check('capture: full amount only, state read first', async () => {
    route(`GET /api/v5/payments/${PAY}`, { body: payment({}, [action('auth')]) });
    route(`POST /api/v5/payments/${PAY}/capture`, {
      body: payment({}, [action('auth'), action('capture')]),
    });
    const done = await adapter.capture?.(ctx, { ...ids, amount: input.amount });
    assert.equal(done?.status, 'captured');
    assert.equal(done?.processorTransactionId, PAY);
    assert.equal(bodyOf(callsTo('/capture')[0]), '{"amount":120.50}');
    setup();
    route(`GET /api/v5/payments/${PAY}`, { body: payment({}, [action('auth')]) });
    assert.equal(
      (await adapter.capture?.(ctx, { ...ids, amount: Money.parse('100.00') }))?.rawCode,
      'CAPTURE_AMOUNT_MISMATCH',
    );
    assert.equal(callsTo('/capture').length, 0);
    setup();
    assert.equal(
      (await adapter.capture?.(ctx, { ...ids, amount: input.amount }))?.rawCode,
      'PAYMENT_NOT_FOUND',
    );
    route(`GET /api/v5/payments/${PAY}`, { body: payment({}, [action('sale')]) });
    assert.equal(
      (await adapter.capture?.(ctx, { ...ids, amount: input.amount }))?.status,
      'captured',
    );
    assert.equal(callsTo('/capture').length, 0);
    route(`GET /api/v5/payments/${PAY}`, { body: payment({}, [action('auth'), action('void')]) });
    assert.equal(
      (await adapter.capture?.(ctx, { ...ids, amount: input.amount }))?.rawCode,
      'PAYMENT_NOT_CAPTURABLE',
    );
    await assert.rejects(
      Promise.resolve().then(() =>
        adapter.capture?.(ctx, { ...ids, processorTransactionId: '../x', amount: input.amount }),
      ),
      ValidationError,
    );
    setup();
    route(`GET /api/v5/payments/${PAY}`, { body: payment({}, [action('auth')]) });
    route(`POST /api/v5/payments/${PAY}/capture`, {
      body: payment({ response: '2', response_code: '200' }),
    });
    assert.equal(
      (await adapter.capture?.(ctx, { ...ids, amount: input.amount }))?.status,
      'declined',
    );
  });

  await check('void: only an uncaptured authorization', async () => {
    route(`GET /api/v5/payments/${PAY}`, { body: payment({}, [action('auth')]) });
    route(`POST /api/v5/payments/${PAY}/void`, {
      body: payment({}, [action('auth'), action('void')]),
    });
    const done = await adapter.voidAuthorization?.(ctx, ids);
    assert.equal(done?.status, 'voided');
    assert.equal(bodyOf(callsTo('/void')[0]), '{}');
    setup();
    route(`GET /api/v5/payments/${PAY}`, { body: payment({}, [action('auth'), action('void')]) });
    assert.equal((await adapter.voidAuthorization?.(ctx, ids))?.status, 'voided');
    assert.equal(callsTo('/void').length, 0);
    route(`GET /api/v5/payments/${PAY}`, { body: payment({}, [action('sale')]) });
    assert.equal((await adapter.voidAuthorization?.(ctx, ids))?.rawCode, 'PAYMENT_NOT_VOIDABLE');
    setup();
    assert.equal((await adapter.voidAuthorization?.(ctx, ids))?.rawCode, 'PAYMENT_NOT_FOUND');
  });

  await check('refund: settled payment, unsettled payment, refusals', async () => {
    const refundInput = { ...ids, amount: Money.parse('25.00'), reason: 'requested' };
    route(`GET /api/v5/payments/${PAY}`, {
      body: payment({ status: 'complete' }, [action('sale')]),
    });
    route(`POST /api/v5/payments/${PAY}/refund`, {
      body: payment({ id: 'refund-77', amount: '25.00' }, [
        action('sale'),
        action('refund', '25.00'),
      ]),
    });
    const refunded = await adapter.refund(ctx, refundInput);
    assert.deepEqual([refunded.status, refunded.processorTransactionId], ['refunded', 'refund-77']);
    assert.ok(refunded.amount.eq('25.00'));
    assert.equal(bodyOf(callsTo('/refund')[0]), '{"amount":25.00}');
    // declined refund
    route(`POST /api/v5/payments/${PAY}/refund`, {
      body: payment({ response: '2', response_code: '200' }),
    });
    assert.equal((await adapter.refund(ctx, refundInput)).status, 'declined');
    // unsettled: whole amount is a void, partial refused
    setup();
    route(`GET /api/v5/payments/${PAY}`, {
      body: payment({ status: 'pendingsettlement' }, [action('sale')]),
    });
    route(`POST /api/v5/payments/${PAY}/void`, {
      body: payment({}, [action('sale'), action('void')]),
    });
    const whole = await adapter.refund(ctx, { ...refundInput, amount: input.amount });
    assert.deepEqual([whole.status, whole.processorTransactionId], ['refunded', PAY]);
    assert.equal(callsTo('/refund').length, 0);
    seen.length = 0;
    assert.equal((await adapter.refund(ctx, refundInput)).rawCode, 'REFUND_NOT_YET_SETTLED');
    assert.equal(seen.length, 1);
    // not captured, too large, unknown
    setup();
    route(`GET /api/v5/payments/${PAY}`, { body: payment({}, [action('auth')]) });
    assert.equal((await adapter.refund(ctx, refundInput)).rawCode, 'PAYMENT_NOT_REFUNDABLE');
    route(`GET /api/v5/payments/${PAY}`, {
      body: payment({ status: 'complete' }, [action('sale')]),
    });
    assert.equal(
      (await adapter.refund(ctx, { ...refundInput, amount: Money.parse('120.51') })).rawCode,
      'REFUND_AMOUNT_INVALID',
    );
    setup();
    assert.equal((await adapter.refund(ctx, refundInput)).rawCode, 'PAYMENT_NOT_FOUND');
  });

  await check('payment states from the actions', async () => {
    const state = (actions: Json[], over: Json = {}): string =>
      fromPayment(payment(over, actions), null, null).status;
    assert.equal(state([action('auth')]), 'authorized');
    assert.equal(state([action('sale')]), 'captured');
    assert.equal(state([action('auth'), action('capture')]), 'captured');
    assert.equal(state([action('sale'), action('void')]), 'voided');
    assert.equal(state([action('sale'), action('refund', '20.50')]), 'captured');
    assert.equal(
      state([action('sale'), action('refund', '20.50'), action('refund', '100.00')]),
      'refunded',
    );
    assert.equal(state([action('sale'), action('refund', '120.50', false)]), 'captured');
    assert.equal(state([]), 'pending');
    assert.equal(state([action('mystery')]), 'pending');
    assert.equal(state([action('auth')], { response: '2', response_code: '201' }), 'declined');
    assert.equal(state([action('auth')], { response: '3' }), 'error');
    assert.ok(
      fromPayment(payment({ amount: 'x' }), Money.parse('3.00'), 'authorized').amount.eq('3.00'),
    );
    route(`GET /api/v5/payments/${PAY}`, { body: payment({}, [action('sale')]) });
    assert.equal((await adapter.getTransaction(ctx, PAY)).status, 'captured');
    setup();
    await assert.rejects(adapter.getTransaction(ctx, PAY), ValidationError);
  });

  await check('card identity and AVS', () => {
    assert.deepEqual(cardIdentity(null), null);
    assert.deepEqual(cardIdentity({ card_hash: 'h' }), { type: 'fingerprint', value: 'h' });
    assert.deepEqual(
      cardIdentity({
        [MASKED]: '411111******1111',
        card_exp: '1029',
        card_type: 'Visa',
        card_bin: '411111',
      }),
      { type: 'fingerprint', value: '411111|1111|1029|Visa' },
    );
    assert.equal(cardIdentity({ [MASKED]: 'xx' }), null);
    for (const code of ['Y', 'X', 'Z', '2']) assert.equal(avsPostal(code), true, code);
    for (const code of ['N', 'A', 'C', '7']) assert.equal(avsPostal(code), false, code);
    for (const code of ['U', 'R', 'S', '0', 'B', null, ''])
      assert.equal(avsPostal(code), null, String(code));
  });

  await check('decline mapping', () => {
    for (const [code, category] of [
      ['202', 'insufficient_funds'],
      ['222', 'invalid_number'],
      ['224', 'invalid_expiry'],
      ['225', 'invalid_cvv'],
      ['253', 'processor_fraud_signal'],
      ['264', 'do_not_honor'],
      ['460', 'processor_error'],
      ['999', 'other'],
    ] as const)
      assert.equal(adapter.mapDecline({ code, message: null }), category, code);
    assert.equal(adapter.mapDecline({ code: null, message: null }), 'other');
  });

  const hookBody = JSON.stringify({
    event_id: '9b312dfd-3174-4748-9447-d63c8744305a',
    event_type: 'transaction.sale.success',
    event_body: { transaction_id: PAY, condition: 'pendingsettlement', requested_amount: '54.04' },
  });
  const header = (body: string, nonce = 'abc123', key = 'whsigningkey0123'): string =>
    `t=${nonce},s=${createHmac('sha256', key).update(`${nonce}.${body}`).digest('hex')}`;
  const verify = (headers: Record<string, string>, rawBody = hookBody): Promise<boolean> =>
    adapter.verifyWebhook(ctx, { headers, rawBody });

  await check('webhook: signature of nonce.body with the signing key', async () => {
    assert.equal(await verify({ 'webhook-signature': header(hookBody) }), true);
    {
      const [prefix = '', hex = ''] = header(hookBody).split(',s=');
      assert.equal(await verify({ 'webhook-signature': `${prefix},s=${hex.toUpperCase()}` }), true);
    }
    assert.equal(await verify({ 'webhook-signature': header(hookBody, 'other-nonce') }), true);
    assert.equal(
      await verify({ 'webhook-signature': header(hookBody, 'abc123', 'wrongkey0000') }),
      false,
    );
    assert.equal(
      await verify({ 'webhook-signature': header(hookBody) }, hookBody.replace('54.04', '1.00')),
      false,
    );
    assert.equal(
      await verify({ 'webhook-signature': header(hookBody).replace('t=abc123', 't=zzz') }),
      false,
    );
    assert.equal(await verify({}), false);
    assert.equal(await verify({ 'webhook-signature': '' }), false);
    assert.equal(await verify({ 'webhook-signature': 'abc' }), false);
    assert.equal(await verify({ 'webhook-signature': 't=abc123,s=nothex' }), false);
    assert.equal(await verify({ 'webhook-signature': header(hookBody) }, ''), false);
    assert.equal(
      await adapter.verifyWebhook(
        { ...ctx, credentials: { ...ctx.credentials, webhookSigningKey: '' } },
        { headers: { 'webhook-signature': header(hookBody, 'abc123', '') }, rawBody: hookBody },
      ),
      false,
    );
    assert.equal(seen.length, 0);
  });

  await check('webhook: event mapping', () => {
    const parse = (
      type: string,
      body: Json = { transaction_id: PAY },
    ): ReturnType<typeof adapter.parseWebhook> =>
      adapter.parseWebhook({
        headers: {},
        rawBody: JSON.stringify({ event_id: `e-${type}`, event_type: type, event_body: body }),
      });
    const base = parse('transaction.sale.success', { transaction_id: PAY, condition: 'complete' });
    assert.deepEqual(
      [base.processorId, base.eventId, base.type, base.processorTransactionId, base.payload],
      [
        'nmi',
        'e-transaction.sale.success',
        'payment.captured',
        PAY,
        { nmiEvent: 'transaction.sale.success', condition: 'complete' },
      ],
    );
    const table: [string, string][] = [
      ['transaction.auth.success', 'payment.authorized'],
      ['transaction.capture.success', 'payment.captured'],
      ['transaction.void.success', 'payment.voided'],
      ['transaction.refund.success', 'payment.refunded'],
      ['transaction.sale.failure', 'payment.failed'],
      ['transaction.auth.failure', 'payment.failed'],
      ['transaction.capture.failure', 'payment.failed'],
      ['transaction.void.failure', 'unknown'],
      ['transaction.refund.unknown', 'unknown'],
      ['transaction.credit.success', 'unknown'],
      ['recurring.subscription.add', 'unknown'],
    ];
    for (const [type, expected] of table) assert.equal(parse(type).type, expected, type);
    assert.equal(parse('settlement.batch.success', {}).processorTransactionId, null);
    assert.throws(() => adapter.parseWebhook({ headers: {}, rawBody: 'x' }));
  });

  setTransportForVerification(null);
  process.stdout.write(`step12-nmi: ${checks} checks passed\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
