// path: scripts/verify/step11-authorizenet.ts
// Checks the Authorize.Net adapter against a local fake transport that answers with the response shapes of Authorize.Net's
// API reference (docs/processors/authorizenet.md). It does NOT replace the sandbox run listed in
// docs/processors/authorizenet.verify.md. Run: npx tsx --conditions=react-server scripts/verify/step11-authorizenet.ts
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { adapter, anetValue } from '@/lib/payment/adapters/authorizenet';
import { referenceId } from '@/lib/payment/adapters/authorizenet/api';
import { avsPostal, lastFour } from '@/lib/payment/adapters/authorizenet/mapping';
import { adapterProblems } from '@/lib/payment/capabilities';
import {
  setTransportForVerification,
  type HttpRequest,
  type HttpResponse,
} from '@/lib/payment/http-client';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, AuthorizeInput } from '@/types/contracts';

const SIGNATURE_KEY = 'ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12';
const ctx: AdapterContext = {
  credentials: {
    apiLoginId: 'testLogin25',
    transactionKey: 'tkey1234abcd5678',
    publicClientKey: 'PublicClientKey0123456789abcdefghij',
    signatureKey: SIGNATURE_KEY,
  },
  environment: 'sandbox',
  mode: 'accept_hosted',
  correlationId: 'c1',
};
const TX = '60020981676';
const input: AuthorizeInput = {
  idempotencyKey: 'a3c1f2d4-1111-4222-8333-444455556666:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'a3c1f2d4-1111-4222-8333-444455556666',
  companyId: 'co',
  paymentToken: 'COMMON.ACCEPT.INAPP.PAYMENT:eyJjb2RlIjoiNTBfMl8wNjAw',
  billing: { postalCode: '10001', country: 'US' },
  payerIp: '203.0.113.5',
  returnUrl: 'https://app.example.com/pay/x',
  threeDS: 'disabled',
  metadata: {},
};

type Json = Record<string, unknown>;
type Reply = { status?: number; text?: string; body?: unknown };
const seen: HttpRequest[] = [];
let routes = new Map<string, Reply | ((body: Json) => Reply)>();
const route = (key: string, reply: Reply | ((body: Json) => Reply)): void =>
  void routes.set(key, reply);
function routeKey(body: Json): string {
  const name = Object.keys(body)[0] ?? '';
  const inner = body[name] as Json;
  const type = (inner.transactionRequest as Json | undefined)?.transactionType;
  return typeof type === 'string' ? `${name} ${type}` : name;
}
setTransportForVerification(async (request): Promise<HttpResponse> => {
  seen.push(request);
  const body = JSON.parse(request.body ?? '{}') as Json;
  const found = routes.get(routeKey(body));
  if (!found) return { status: 404, text: '{}', headers: {} };
  const reply = typeof found === 'function' ? found(body) : found;
  return {
    status: reply.status ?? 200,
    text: reply.text ?? JSON.stringify(reply.body),
    headers: {},
  };
});

const ok = { resultCode: 'Ok', message: [{ code: 'I00001', text: 'Successful.' }] };
const transaction = (response: Json, resultOk = true): Reply => ({
  body: {
    transactionResponse: response,
    messages: resultOk
      ? ok
      : { resultCode: 'Error', message: [{ code: 'E00027', text: 'unsuccessful' }] },
  },
});
const approved = (over: Json = {}): Json => ({
  responseCode: '1',
  authCode: 'HW617E',
  avsResultCode: 'Y',
  cvvResultCode: 'M',
  transId: TX,
  accountNumber: 'XXXX1111',
  accountType: 'Visa',
  messages: [{ code: '1', description: 'approved' }],
  ...over,
});
const refusedWith = (responseCode: string, errorCode: string): Reply =>
  transaction(
    {
      responseCode,
      avsResultCode: 'P',
      transId: '0',
      errors: [{ errorCode, errorText: 't' }],
    },
    false,
  );
const detail = (status: string, over: Json = {}): Reply => ({
  body: {
    transaction: {
      transId: TX,
      transactionStatus: status,
      responseCode: 1,
      responseReasonCode: 1,
      authAmount: 120.5,
      settleAmount: 120.5,
      AVSResponse: 'Y',
      payment: { creditCard: { cardNumber: 'XXXX1111', expirationDate: 'XXXX', cardType: 'Visa' } },
      ...over,
    },
    messages: ok,
  },
});
const authFailure = (code: string): Reply => ({
  body: { messages: { resultCode: 'Error', message: [{ code, text: 'x' }] } },
});
const requestOf = (r: HttpRequest | undefined): Json =>
  (Object.values(JSON.parse(r?.body ?? '{}') as Json)[0] ?? {}) as Json;
const trOf = (r: HttpRequest | undefined): Json => (requestOf(r).transactionRequest ?? {}) as Json;

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
const sha512 = (key: Buffer | string, body: string): string =>
  createHmac('sha512', key).update(body, 'utf8').digest('hex');

async function main(): Promise<void> {
  await check('contract is complete', () => {
    assert.deepEqual(adapterProblems(adapter), []);
    assert.deepEqual(
      adapter.credentialFields.map((f) => [f.key, f.secret]),
      [
        ['apiLoginId', false],
        ['transactionKey', true],
        ['publicClientKey', false],
        ['signatureKey', true],
      ],
    );
    assert.equal(adapter.capabilities.supportsThreeDS, false);
  });

  await check('value formatting, reference id, helpers', () => {
    assert.equal(anetValue(Money.parse('120.5')), '120.50');
    assert.equal(anetValue(Money.parse('0.07')), '0.07');
    assert.equal(anetValue(Money.parse('1000')), '1000.00');
    const ref = referenceId(input.idempotencyKey);
    assert.equal(ref.length, 20);
    assert.equal(ref, createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 20));
    assert.equal(lastFour('XXXX0015'), '0015');
    assert.equal(lastFour('XXXX'), null);
    assert.equal(lastFour(null), null);
    for (const c of ['Y', 'Z', 'W', 'X']) assert.equal(avsPostal(c), true, c);
    for (const c of ['A', 'N']) assert.equal(avsPostal(c), false, c);
    for (const c of ['B', 'E', 'G', 'P', 'R', 'S', 'U', null])
      assert.equal(avsPostal(c), null, String(c));
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
      apiLoginId: 'testLogin25',
      clientKey: 'PublicClientKey0123456789abcdefghij',
      scriptUrl: 'https://jstest.authorize.net/v3/AcceptUI.js',
      environment: 'sandbox',
    });
    assert.ok(!JSON.stringify(session).includes('tkey1234'));
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
    assert.equal(live.clientConfig.scriptUrl, 'https://js.authorize.net/v3/AcceptUI.js');
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

  await check('authorize: request in schema order, result mapped', async () => {
    route('createTransactionRequest authOnlyTransaction', transaction(approved()));
    const result = await adapter.authorize(ctx, input);
    const request = seen[0];
    assert.equal(request?.url, 'https://apitest.authorize.net/xml/v1/request.api');
    assert.equal(request?.headers['content-type'], 'application/json');
    const body = requestOf(request);
    assert.deepEqual(body.merchantAuthentication, {
      name: 'testLogin25',
      transactionKey: 'tkey1234abcd5678',
    });
    assert.equal(body.refId, referenceId(input.idempotencyKey));
    assert.deepEqual(Object.keys(body), ['merchantAuthentication', 'refId', 'transactionRequest']);
    assert.deepEqual(Object.keys(trOf(request)), [
      'transactionType',
      'amount',
      'payment',
      'order',
      'customerIP',
    ]);
    assert.equal(trOf(request).amount, '120.50');
    assert.deepEqual(trOf(request).payment, {
      opaqueData: {
        dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
        dataValue: 'eyJjb2RlIjoiNTBfMl8wNjAw',
      },
    });
    assert.deepEqual(trOf(request).order, {
      invoiceNumber: 'a3c1f2d41111422283334444'.slice(0, 20),
    });
    assert.equal(trOf(request).customerIP, '203.0.113.5');
    assert.equal(result.status, 'authorized');
    assert.equal(result.processorTransactionId, TX);
    assert.ok(result.amount.eq('120.50'));
    assert.equal(result.avsPostalCodeMatch, true);
    assert.equal(result.cardIdentity, null);
    assert.deepEqual(result.threeDS, {
      requested: false,
      completed: false,
      authenticated: false,
      liabilityShift: null,
    });
  });

  await check('authorize: IPv6 address is not sent; AVS mismatch', async () => {
    route(
      'createTransactionRequest authOnlyTransaction',
      transaction(approved({ avsResultCode: 'A' })),
    );
    const result = await adapter.authorize(ctx, { ...input, payerIp: '2001:db8::1' });
    assert.equal(trOf(seen[0]).customerIP, undefined);
    assert.equal(result.avsPostalCodeMatch, false);
  });

  await check('declines by reason code, errors and held transactions', async () => {
    const expected: [string, string][] = [
      ['2', 'do_not_honor'],
      ['3', 'do_not_honor'],
      ['4', 'processor_fraud_signal'],
      ['6', 'invalid_number'],
      ['8', 'invalid_expiry'],
      ['44', 'invalid_cvv'],
      ['45', 'invalid_cvv'],
      ['65', 'invalid_cvv'],
      ['250', 'processor_fraud_signal'],
      ['251', 'processor_fraud_signal'],
      ['19', 'processor_error'],
      ['901', 'processor_error'],
      ['27', 'other'],
      ['11', 'other'],
    ];
    for (const [code, category] of expected) {
      route('createTransactionRequest authOnlyTransaction', refusedWith('2', code));
      const result = await adapter.authorize(ctx, input);
      assert.equal(result.status, 'declined', code);
      assert.equal(result.declineCategory, category, code);
      assert.equal(result.rawCode, code);
      assert.equal(result.processorTransactionId, null);
      assert.equal(adapter.mapDecline({ code, message: null }), category);
    }
    route('createTransactionRequest authOnlyTransaction', refusedWith('3', '19'));
    const error = await adapter.authorize(ctx, input);
    assert.deepEqual([error.status, error.declineCategory], ['error', 'processor_error']);
    route(
      'createTransactionRequest authOnlyTransaction',
      transaction(
        approved({ responseCode: '4', messages: [{ code: '253', description: 'held' }] }),
      ),
    );
    const held = await adapter.authorize(ctx, input);
    assert.deepEqual(
      [held.status, held.rawCode, held.processorTransactionId],
      ['pending', '253', TX],
    );
  });

  await check('credentials, outages, byte order mark, bad input', async () => {
    for (const code of ['E00006', 'E00007', 'E00008', 'E00010']) {
      route('createTransactionRequest authOnlyTransaction', authFailure(code));
      await assert.rejects(adapter.authorize(ctx, input), ValidationError, code);
    }
    route('createTransactionRequest authOnlyTransaction', { status: 503, text: '' });
    await assert.rejects(adapter.authorize(ctx, input), /unavailable/);
    route('createTransactionRequest authOnlyTransaction', { text: '<html>maintenance</html>' });
    await assert.rejects(adapter.authorize(ctx, input), /without JSON/);
    route('createTransactionRequest authOnlyTransaction', {
      text: `${String.fromCharCode(0xfeff)}${JSON.stringify(transaction(approved()).body)}`,
    });
    assert.equal((await adapter.authorize(ctx, input)).status, 'authorized');
    await assert.rejects(adapter.authorize({ ...ctx, credentials: {} }, input), ValidationError);
    for (const token of [
      '',
      'nocolon',
      ':value12345',
      'X.Y:short',
      'COMMON.ACCEPT.INAPP.PAYMENT:bad value!',
    ]) {
      await assert.rejects(
        adapter.authorize(ctx, { ...input, paymentToken: token }),
        ValidationError,
        token,
      );
    }
  });

  await check('capture and void', async () => {
    route(
      'createTransactionRequest priorAuthCaptureTransaction',
      transaction(approved({ transId: '60020981999' })),
    );
    const captured = await adapter.capture?.(ctx, {
      idempotencyKey: 'pay_1:capture',
      processorTransactionId: TX,
      amount: Money.parse('100'),
    });
    assert.deepEqual(Object.keys(trOf(seen[0])), ['transactionType', 'amount', 'refTransId']);
    assert.equal(trOf(seen[0]).amount, '100.00');
    assert.equal(trOf(seen[0]).refTransId, TX);
    assert.deepEqual([captured?.status, captured?.processorTransactionId], ['captured', TX]);
    route('createTransactionRequest priorAuthCaptureTransaction', refusedWith('3', '311'));
    const again = await adapter.capture?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
      amount: Money.parse('100'),
    });
    assert.deepEqual([again?.status, again?.rawCode], ['error', '311']);
    await assert.rejects(
      adapter.capture?.(ctx, {
        idempotencyKey: 'k',
        processorTransactionId: '../x',
        amount: Money.parse('1'),
      }) ?? Promise.resolve(),
      ValidationError,
    );
    route(
      'createTransactionRequest voidTransaction',
      transaction(approved({ transId: '60020982000' })),
    );
    const voided = await adapter.voidAuthorization?.(ctx, {
      idempotencyKey: 'pay_1:void',
      processorTransactionId: TX,
    });
    assert.deepEqual(Object.keys(trOf(seen[seen.length - 1])), ['transactionType', 'refTransId']);
    assert.deepEqual([voided?.status, voided?.processorTransactionId], ['voided', TX]);
    route('createTransactionRequest voidTransaction', refusedWith('3', '310'));
    assert.equal(
      (await adapter.voidAuthorization?.(ctx, { idempotencyKey: 'k', processorTransactionId: TX }))
        ?.status,
      'voided',
    );
    route('createTransactionRequest voidTransaction', refusedWith('3', '327'));
    assert.equal(
      (await adapter.voidAuthorization?.(ctx, { idempotencyKey: 'k', processorTransactionId: TX }))
        ?.status,
      'error',
    );
  });

  await check(
    'refund: settled -> refund with last four digits; not settled -> void or a clear refusal',
    async () => {
      route('getTransactionDetailsRequest', detail('settledSuccessfully'));
      route(
        'createTransactionRequest refundTransaction',
        transaction(approved({ transId: '60020983000' })),
      );
      const refunded = await adapter.refund(ctx, {
        idempotencyKey: 'ref_1:refund',
        processorTransactionId: TX,
        amount: Money.parse('25'),
        reason: null,
      });
      const refundRequest = seen.find((r) => trOf(r).transactionType === 'refundTransaction');
      assert.deepEqual(Object.keys(trOf(refundRequest)), [
        'transactionType',
        'amount',
        'payment',
        'refTransId',
      ]);
      assert.deepEqual(trOf(refundRequest).payment, {
        creditCard: { cardNumber: '1111', expirationDate: 'XXXX' },
      });
      assert.equal(trOf(refundRequest).amount, '25.00');
      assert.deepEqual(
        [refunded.status, refunded.processorTransactionId],
        ['refunded', '60020983000'],
      );
      route('createTransactionRequest refundTransaction', refusedWith('3', '54'));
      const refused = await adapter.refund(ctx, {
        idempotencyKey: 'k',
        processorTransactionId: TX,
        amount: Money.parse('25'),
        reason: null,
      });
      assert.deepEqual([refused.status, refused.rawCode], ['error', '54']);
      route('getTransactionDetailsRequest', detail('capturedPendingSettlement'));
      route('createTransactionRequest voidTransaction', transaction(approved()));
      const whole = await adapter.refund(ctx, {
        idempotencyKey: 'ref_2:refund',
        processorTransactionId: TX,
        amount: Money.parse('120.50'),
        reason: null,
      });
      assert.deepEqual([whole.status, whole.processorTransactionId], ['refunded', TX]);
      const early = await adapter.refund(ctx, {
        idempotencyKey: 'ref_3:refund',
        processorTransactionId: TX,
        amount: Money.parse('20'),
        reason: null,
      });
      assert.deepEqual([early.status, early.rawCode], ['declined', 'REFUND_NOT_YET_SETTLED']);
      route('getTransactionDetailsRequest', detail('authorizedPendingCapture'));
      const notYet = await adapter.refund(ctx, {
        idempotencyKey: 'k',
        processorTransactionId: TX,
        amount: Money.parse('20'),
        reason: null,
      });
      assert.deepEqual([notYet.status, notYet.rawCode], ['declined', 'authorizedPendingCapture']);
      route(
        'getTransactionDetailsRequest',
        detail('settledSuccessfully', {
          payment: { creditCard: { cardNumber: 'XXXX', expirationDate: 'XXXX' } },
        }),
      );
      assert.equal(
        (
          await adapter.refund(ctx, {
            idempotencyKey: 'k',
            processorTransactionId: TX,
            amount: Money.parse('1'),
            reason: null,
          })
        ).rawCode,
        'CARD_DIGITS_MISSING',
      );
      route('getTransactionDetailsRequest', {
        body: { messages: { resultCode: 'Error', message: [{ code: 'E00040', text: 'x' }] } },
      });
      assert.equal(
        (
          await adapter.refund(ctx, {
            idempotencyKey: 'k',
            processorTransactionId: TX,
            amount: Money.parse('1'),
            reason: null,
          })
        ).status,
        'declined',
      );
    },
  );

  await check('status lookup', async () => {
    const states: [string, string][] = [
      ['authorizedPendingCapture', 'authorized'],
      ['capturedPendingSettlement', 'captured'],
      ['settledSuccessfully', 'captured'],
      ['refundPendingSettlement', 'refunded'],
      ['voided', 'voided'],
      ['expired', 'voided'],
      ['declined', 'declined'],
      ['FDSPendingReview', 'pending'],
      ['generalError', 'error'],
      ['somethingNew', 'error'],
    ];
    for (const [status, mapped] of states) {
      route('getTransactionDetailsRequest', detail(status));
      const found = await adapter.getTransaction(ctx, TX);
      assert.equal(found.status, mapped, status);
      assert.ok(found.amount.eq('120.50'));
    }
    route('getTransactionDetailsRequest', {
      body: { messages: { resultCode: 'Error', message: [{ code: 'E00040', text: 'x' }] } },
    });
    await assert.rejects(adapter.getTransaction(ctx, TX), ValidationError);
    await assert.rejects(adapter.getTransaction(ctx, 'abc'), ValidationError);
  });

  await check('connection test', async () => {
    route('authenticateTestRequest', { body: { messages: ok } });
    assert.equal((await adapter.testConnection(ctx)).ok, true);
    route('authenticateTestRequest', authFailure('E00007'));
    const bad = await adapter.testConnection(ctx);
    assert.equal(bad.ok, false);
    assert.ok(!bad.message.includes('tkey1234'));
    route('authenticateTestRequest', {
      body: { messages: { resultCode: 'Error', message: [{ code: 'E00001', text: 'x' }] } },
    });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    route('authenticateTestRequest', { status: 503, text: '' });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
  });

  await check('webhook verification (HMAC-SHA512 of the body)', async () => {
    const raw = JSON.stringify({
      notificationId: 'n1',
      eventType: 'net.authorize.payment.authcapture.created',
    });
    const verify = (headers: Record<string, string>, body = raw, c = ctx): Promise<boolean> =>
      adapter.verifyWebhook(c, { headers, rawBody: body });
    const text = sha512(SIGNATURE_KEY, raw);
    const bytes = sha512(Buffer.from(SIGNATURE_KEY, 'hex'), raw);
    for (const value of [
      text,
      text.toUpperCase(),
      `sha512=${text.toUpperCase()}`,
      `SHA512=${text}`,
      bytes,
      `sha512=${bytes}`,
    ]) {
      assert.equal(await verify({ 'x-anet-signature': value }), true, value.slice(0, 12));
    }
    // A key that is not hexadecimal is used as text only.
    const plain = {
      ...ctx,
      credentials: { ...ctx.credentials, signatureKey: 'not-a-hex-key-just-text-0123456789' },
    };
    assert.equal(
      await verify(
        { 'x-anet-signature': sha512('not-a-hex-key-just-text-0123456789', raw) },
        raw,
        plain,
      ),
      true,
    );
    assert.equal(await verify({ 'x-anet-signature': sha512('other', raw) }), false);
    assert.equal(await verify({ 'x-anet-signature': text }, `${raw} `), false);
    assert.equal(await verify({ 'x-anet-signature': 'abc' }), false);
    assert.equal(await verify({ 'x-anet-signature': 'sha512=' }), false);
    assert.equal(await verify({}), false);
    assert.equal(await verify({ 'x-anet-signature': sha512(SIGNATURE_KEY, '') }, ''), false);
    assert.equal(
      await verify({ 'x-anet-signature': text }, raw, { ...ctx, credentials: {} }),
      false,
    );
    assert.equal(seen.length, 0);
  });

  await check('webhook events', () => {
    const parse = (
      eventType: string,
      payload: Json = { entityName: 'transaction', id: TX },
    ): ReturnType<typeof adapter.parseWebhook> =>
      adapter.parseWebhook({
        headers: {},
        rawBody: JSON.stringify({
          notificationId: 'N1',
          eventType,
          eventDate: '2026-10-17T10:00:00.0000000Z',
          webhookId: 'w',
          payload,
        }),
      });
    const expected: [string, string][] = [
      ['net.authorize.payment.authorization.created', 'payment.authorized'],
      ['net.authorize.payment.authcapture.created', 'payment.captured'],
      ['net.authorize.payment.capture.created', 'payment.captured'],
      ['net.authorize.payment.priorAuthCapture.created', 'payment.captured'],
      ['net.authorize.payment.refund.created', 'payment.refunded'],
      ['net.authorize.payment.void.created', 'payment.voided'],
      ['net.authorize.payment.fraud.approved', 'payment.authorized'],
      ['net.authorize.payment.fraud.declined', 'payment.failed'],
      ['net.authorize.payment.fraud.held', 'unknown'],
      ['net.authorize.customer.created', 'unknown'],
    ];
    for (const [eventType, type] of expected) {
      const event = parse(eventType);
      assert.equal(event.type, type, eventType);
      assert.equal(event.eventId, 'N1');
      assert.equal(event.processorId, 'authorizenet');
      assert.equal(event.occurredAt, '2026-10-17T10:00:00.000Z');
    }
    assert.equal(parse('net.authorize.payment.authcapture.created').processorTransactionId, TX);
    assert.equal(
      parse('net.authorize.payment.authcapture.created', {
        entityName: 'transaction',
        id: 60020981676,
      }).processorTransactionId,
      TX,
    );
    assert.equal(
      parse('net.authorize.customer.created', { entityName: 'customerProfile', id: '394' })
        .processorTransactionId,
      null,
    );
    assert.equal(
      parse('net.authorize.payment.authcapture.created', { entityName: 'transaction', id: '../x' })
        .processorTransactionId,
      null,
    );
    assert.throws(() => adapter.parseWebhook({ headers: {}, rawBody: 'x' }));
  });

  setTransportForVerification(null);
  process.stdout.write(`step11-authorizenet: ${checks} checks passed\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
