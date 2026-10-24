// path: scripts/verify/step12-rapyd.ts
// Checks the Rapyd adapter against a local fake transport that answers with the response shapes of Rapyd's reference
// pages (docs/processors/rapyd.md). It does NOT replace the sandbox run listed in docs/processors/rapyd.verify.md.
// Run: npx tsx --conditions=react-server scripts/verify/step12-rapyd.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { adapter } from '@/lib/payment/adapters/rapyd';
import { amountSlot, amountText, jsonWithAmounts } from '@/lib/payment/adapters/rapyd/api';
import { cardIdentity, fromPayment, moneyOf } from '@/lib/payment/adapters/rapyd/mapping';
import { adapterProblems } from '@/lib/payment/capabilities';
import {
  setTransportForVerification,
  type HttpRequest,
  type HttpResponse,
} from '@/lib/payment/http-client';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, AuthorizeInput } from '@/types/contracts';

const ACCESS = 'rak_ABCDEF123456';
const SECRET = 'rsk_0123456789abcdef0123456789abcdef';
const HOOK_URL = 'https://app.example.com/api/webhooks/rapyd';
const ctx: AdapterContext = {
  credentials: {
    accessKey: ACCESS,
    secretKey: SECRET,
    webhookUrl: HOOK_URL,
    merchantCountry: 'US',
  },
  environment: 'sandbox',
  mode: 'checkout_toolkit',
  correlationId: 'c1',
};
const PAY = 'payment_f2e57196a80852a24b644ef6ceea56f7';
const CHK = 'checkout_d7789dc520318707f9e7ceefbfe2a9f9';
const input: AuthorizeInput = {
  idempotencyKey: 'a3c1f2d4-1111-4222-8333-444455556666:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'inv-uuid-1',
  companyId: 'co',
  paymentToken: PAY,
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
  const found = routes.get(`${request.method} ${new URL(request.url).pathname}`);
  const reply = found ?? {
    status: 400,
    body: { status: { status: 'ERROR', error_code: 'ERROR_GET_PAYMENT', message: 'x' } },
  };
  return { status: reply.status ?? 200, text: JSON.stringify(reply.body), headers: {} };
});

const ok = (data: unknown): Reply => ({
  body: { status: { error_code: '', status: 'SUCCESS', message: '', operation_id: 'o' }, data },
});
const payment = (over: Json = {}): Json => ({
  id: PAY,
  amount: 120.5,
  original_amount: 120.5,
  currency_code: 'USD',
  status: 'CLO',
  paid: true,
  captured: true,
  refunded: false,
  refunded_amount: 0,
  merchant_reference_id: 'inv-uuid-1',
  metadata: { invoice_id: 'inv-uuid-1' },
  payment_method_type_category: 'card',
  failure_code: '',
  payment_method_data: {
    category: 'card',
    last4: '1111',
    expiration_month: '12',
    expiration_year: '29',
    fingerprint_token: 'ocfp_11ECFC396977BB4E81220EC01B2F2B1B',
    bin_details: { bin_number: '411111', brand: 'VISA' },
  },
  ...over,
});
const bodyOf = (r: HttpRequest | undefined): Json => JSON.parse(r?.body ?? '{}') as Json;
const expectedSignature = (
  method: string,
  path: string,
  salt: string,
  timestamp: string,
  body: string,
): string =>
  Buffer.from(
    createHmac('sha256', SECRET)
      .update(method + path + salt + timestamp + ACCESS + SECRET + body)
      .digest('hex'),
  ).toString('base64');

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
const hookSignature = (raw: string, salt: string, timestamp: string, url = HOOK_URL): string =>
  Buffer.from(
    createHmac('sha256', SECRET)
      .update(url + salt + timestamp + ACCESS + SECRET + raw)
      .digest('hex'),
  ).toString('base64');
const hook = (raw: string, headers: Record<string, string>, nowMs?: number): Promise<boolean> => {
  void nowMs;
  return adapter.verifyWebhook(ctx, { rawBody: raw, headers });
};
const nowSeconds = (): string => String(Math.floor(Date.now() / 1000));

async function main(): Promise<void> {
  await check('contract: one-step card sale', () => {
    assert.deepEqual(adapterProblems(adapter), []);
    assert.equal(adapter.capabilities.supportsAuthCapture, false);
    assert.equal(adapter.capabilities.isMerchantOfRecord, false);
    assert.equal(adapter.capture, undefined);
    assert.equal(adapter.voidAuthorization, undefined);
    assert.ok(adapter.charge);
    assert.deepEqual(adapter.capabilities.currencies, ['USD']);
    for (const field of adapter.credentialFields)
      assert.ok(new RegExp(field.pattern ?? '').test(ctx.credentials[field.key] ?? ''), field.key);
  });

  await check('amount text is the shortest decimal', () => {
    assert.equal(amountText(Money.parse('120.50')), '120.5');
    assert.equal(amountText(Money.parse('120.00')), '120');
    assert.equal(amountText(Money.parse('0.07')), '0.07');
    assert.equal(jsonWithAmounts({ a: amountSlot(Money.parse('20.00')) }), '{"a":20}');
    assert.equal(moneyOf(87.36)?.toDbString(), '87.3600');
    assert.equal(moneyOf('1'), null);
  });

  await check('checkout page: exact request and signature, public data only', async () => {
    route('POST /v1/checkout', {
      status: 200,
      body: ok({ id: CHK, redirect_url: 'https://sandboxcheckout.rapyd.net/?token=' + CHK }).body,
    });
    const result = await session();
    assert.deepEqual(result.clientConfig, {
      checkoutId: CHK,
      scriptUrl: 'https://sandboxcheckouttoolkit.rapyd.net',
    });
    assert.ok(!JSON.stringify(result).includes(SECRET));
    const request = seen[0];
    assert.equal(request?.url, 'https://sandboxapi.rapyd.net/v1/checkout');
    const h = request?.headers ?? {};
    assert.equal(h.access_key, ACCESS);
    assert.match(h.salt ?? '', /^[0-9a-f]{16}$/);
    assert.equal(
      h.signature,
      expectedSignature(
        'post',
        '/v1/checkout',
        h.salt ?? '',
        h.timestamp ?? '',
        request?.body ?? '',
      ),
    );
    assert.match(h.idempotency ?? '', /^[0-9a-f]{40}$/);
    assert.ok(!(request?.body ?? '').includes(' '));
    assert.deepEqual(bodyOf(request), {
      amount: 120.5,
      currency: 'USD',
      country: 'US',
      merchant_reference_id: 'inv-uuid-1',
      metadata: { invoice_id: 'inv-uuid-1', company_id: 'co' },
      payment_method_type_categories: ['card'],
      capture: true,
      language: 'en',
      payment_expiration: 3600,
      complete_payment_url: input.returnUrl,
      error_payment_url: input.returnUrl,
      complete_checkout_url: input.returnUrl,
      cancel_checkout_url: input.returnUrl,
    });
    routes = new Map();
    route('POST /v1/checkout', ok({ id: CHK }));
    const live = await session({ ...ctx, environment: 'live' });
    assert.equal(seen[1]?.url, 'https://api.rapyd.net/v1/checkout');
    assert.equal(live.clientConfig.scriptUrl, 'https://checkouttoolkit.rapyd.net');
  });

  await check('checkout page: refusals', async () => {
    route('POST /v1/checkout', {
      status: 400,
      body: { status: { status: 'ERROR', error_code: 'ERROR_X', message: 'x' } },
    });
    await assert.rejects(session(), /ERROR_X/);
    route('POST /v1/checkout', ok({ id: 'bogus' }));
    await assert.rejects(session(), ValidationError);
    await assert.rejects(
      session({ ...ctx, credentials: { ...ctx.credentials, merchantCountry: '' } }),
      ValidationError,
    );
    await assert.rejects(
      adapter.createCheckoutSession(ctx, {
        idempotencyKey: 'k',
        amount: input.amount,
        invoiceId: 'i',
        companyId: 'c',
        returnUrl: 'http://localhost/x',
        threeDS: 'disabled',
      }),
      ValidationError,
    );
    route('POST /v1/checkout', { status: 401, body: {} });
    await assert.rejects(session(), /did not accept/);
    route('POST /v1/checkout', { status: 503, body: {} });
    await assert.rejects(session(), /unavailable/);
    await assert.rejects(
      session({ ...ctx, credentials: { ...ctx.credentials, secretKey: '' } }),
      ValidationError,
    );
  });

  await check('charge and authorize verify the payment', async () => {
    route(`GET /v1/payments/${PAY}`, ok(payment()));
    for (const call of [adapter.charge, adapter.authorize]) {
      const result = await call?.(ctx, input);
      assert.equal(result?.status, 'captured');
      assert.equal(result?.amount.toDbString(), '120.5000');
      assert.equal(result?.processorTransactionId, PAY);
      assert.deepEqual(result?.cardIdentity, {
        type: 'fingerprint',
        value: 'ocfp_11ECFC396977BB4E81220EC01B2F2B1B',
      });
    }
    const h = seen[0]?.headers ?? {};
    assert.equal(
      h.signature,
      expectedSignature('get', `/v1/payments/${PAY}`, h.salt ?? '', h.timestamp ?? '', ''),
    );
    assert.equal(seen[0]?.body, undefined);
    // tagged by metadata only
    route(`GET /v1/payments/${PAY}`, ok(payment({ merchant_reference_id: '' })));
    assert.equal((await adapter.charge?.(ctx, input))?.status, 'captured');
  });

  await check('verification: refusals', async () => {
    const cases: Array<[string, Json | null]> = [
      ['active', payment({ status: 'ACT', paid: false, captured: false })],
      [
        'error',
        payment({ status: 'ERR', paid: false, failure_code: 'ERROR_PROCESSING_CARD - [51]' }),
      ],
      ['not paid', payment({ paid: false })],
      ['other currency', payment({ currency_code: 'EUR' })],
      ['other amount', payment({ amount: 99 })],
      ['other invoice', payment({ merchant_reference_id: 'x', metadata: { invoice_id: 'x' } })],
      ['not a card', payment({ payment_method_type_category: 'bank_redirect' })],
      ['unknown', null],
    ];
    for (const [name, data] of cases) {
      route(
        `GET /v1/payments/${PAY}`,
        data
          ? ok(data)
          : { status: 400, body: { status: { status: 'ERROR', error_code: 'ERROR_GET_PAYMENT' } } },
      );
      assert.equal((await adapter.charge?.(ctx, input))?.status, 'declined', name);
    }
    await assert.rejects(
      adapter.charge?.(ctx, { ...input, paymentToken: 'payment_bad' }) ?? Promise.resolve(),
      ValidationError,
    );
  });

  await check('refund: whole, partial, states, refusals', async () => {
    route(`GET /v1/payments/${PAY}`, ok(payment()));
    route(
      'POST /v1/refunds',
      ok({ id: 'refund_34d395388fd0bd22f65f74b130fd58b5', amount: 120.5, status: 'Completed' }),
    );
    const whole = await adapter.refund?.(ctx, {
      idempotencyKey: 'rk',
      processorTransactionId: PAY,
      amount: Money.parse('120.50'),
      reason: 'duplicate',
    });
    assert.equal(whole?.status, 'refunded');
    assert.equal(whole?.processorTransactionId, 'refund_34d395388fd0bd22f65f74b130fd58b5');
    assert.equal(seen[1]?.body, `{"payment":"${PAY}","amount":120.5,"reason":"duplicate"}`);
    assert.match(seen[1]?.headers.idempotency ?? '', /^[0-9a-f]{40}$/);
    route('POST /v1/refunds', ok({ id: 'refund_x', amount: 20, status: 'Pending' }));
    const pending = await adapter.refund?.(ctx, {
      idempotencyKey: 'rk2',
      processorTransactionId: PAY,
      amount: Money.parse('20.00'),
      reason: null,
    });
    assert.equal(pending?.status, 'pending');
    assert.equal(seen[3]?.body, `{"payment":"${PAY}","amount":20,"reason":"Refund requested"}`);
    route('POST /v1/refunds', ok({ id: 'refund_y', amount: 20, status: 'Rejected' }));
    assert.equal(
      (
        await adapter.refund?.(ctx, {
          idempotencyKey: 'rk3',
          processorTransactionId: PAY,
          amount: Money.parse('20.00'),
          reason: null,
        })
      )?.status,
      'declined',
    );
    route('POST /v1/refunds', {
      status: 400,
      body: { status: { status: 'ERROR', error_code: 'ERROR_REFUND' } },
    });
    assert.equal(
      (
        await adapter.refund?.(ctx, {
          idempotencyKey: 'rk4',
          processorTransactionId: PAY,
          amount: Money.parse('20.00'),
          reason: null,
        })
      )?.status,
      'declined',
    );
    assert.equal(
      (
        await adapter.refund?.(ctx, {
          idempotencyKey: 'rk5',
          processorTransactionId: PAY,
          amount: Money.parse('500.00'),
          reason: null,
        })
      )?.rawCode,
      'REFUND_AMOUNT_INVALID',
    );
    route(`GET /v1/payments/${PAY}`, ok(payment({ refunded: true, refunded_amount: 100 })));
    assert.equal(
      (
        await adapter.refund?.(ctx, {
          idempotencyKey: 'rk6',
          processorTransactionId: PAY,
          amount: Money.parse('30.00'),
          reason: null,
        })
      )?.rawCode,
      'REFUND_AMOUNT_INVALID',
    );
    route(`GET /v1/payments/${PAY}`, ok(payment({ refunded: true, refunded_amount: 120.5 })));
    assert.equal(
      (
        await adapter.refund?.(ctx, {
          idempotencyKey: 'rk7',
          processorTransactionId: PAY,
          amount: Money.parse('120.50'),
          reason: null,
        })
      )?.status,
      'refunded',
    );
    route(`GET /v1/payments/${PAY}`, ok(payment({ status: 'ACT', paid: false, captured: false })));
    assert.equal(
      (
        await adapter.refund?.(ctx, {
          idempotencyKey: 'rk8',
          processorTransactionId: PAY,
          amount: Money.parse('20.00'),
          reason: null,
        })
      )?.rawCode,
      'PAYMENT_NOT_REFUNDABLE',
    );
  });

  await check('states, identity, decline mapping, connection test', async () => {
    assert.equal(fromPayment(payment({ status: 'CAN', paid: false }), null).status, 'voided');
    assert.equal(fromPayment(payment({ status: 'REV' }), null).status, 'voided');
    assert.equal(fromPayment(payment({ status: 'EXP', paid: false }), null).status, 'declined');
    assert.equal(fromPayment(payment({ status: 'XXX' }), null).status, 'error');
    const noFingerprint = payment();
    (noFingerprint.payment_method_data as Json).fingerprint_token = undefined;
    assert.deepEqual(cardIdentity(noFingerprint), {
      type: 'fingerprint',
      value: '411111|1111|12/29|VISA',
    });
    assert.equal(
      cardIdentity(payment({ payment_method_data: { category: 'bank_redirect' } })),
      null,
    );
    assert.equal(
      adapter.mapDecline({ code: 'ERROR_PROCESSING_CARD - [51]', message: null }),
      'insufficient_funds',
    );
    assert.equal(
      adapter.mapDecline({ code: 'ERROR_PROCESSING_CARD - [05]', message: null }),
      'do_not_honor',
    );
    assert.equal(
      adapter.mapDecline({ code: 'ERROR_PROCESSING_CARD - [43]', message: null }),
      'processor_fraud_signal',
    );
    assert.equal(
      adapter.mapDecline({ code: 'ERROR_PROCESSING_CARD - [99]', message: null }),
      'other',
    );
    route(`GET /v1/payments/${PAY}`, ok(payment()));
    assert.equal((await adapter.getTransaction?.(ctx, PAY))?.status, 'captured');
    await assert.rejects(adapter.getTransaction?.(ctx, 'x') ?? Promise.resolve(), ValidationError);
    assert.equal((await adapter.testConnection(ctx)).ok, true);
    route('GET /v1/payments/payment_00000000000000000000000000000000', { status: 401, body: {} });
    const refused = await adapter.testConnection(ctx);
    assert.equal(refused.ok, false);
    assert.ok(!refused.message.includes(SECRET));
    route('GET /v1/payments/payment_00000000000000000000000000000000', { status: 503, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
  });

  await check('webhooks: signature', async () => {
    const raw = JSON.stringify({ id: 'wh_1', type: 'PAYMENT_CAPTURED', data: { id: PAY } });
    const ts = nowSeconds();
    const good = {
      salt: 'abcdef123456',
      timestamp: ts,
      signature: hookSignature(raw, 'abcdef123456', ts),
    };
    assert.equal(await hook(raw, good), true);
    assert.equal(
      await hook(raw, {
        ...good,
        signature: good.signature.replace(/\+/g, '-').replace(/\//g, '_'),
      }),
      true,
    );
    assert.equal(await hook(raw + ' ', good), false);
    assert.equal(await hook(raw, { ...good, salt: 'other' }), false);
    assert.equal(
      await hook(raw, {
        ...good,
        signature: hookSignature(raw, 'abcdef123456', ts, 'https://other.example.com/x'),
      }),
      false,
    );
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    assert.equal(
      await hook(raw, { salt: 's1', timestamp: old, signature: hookSignature(raw, 's1', old) }),
      false,
    );
    assert.equal(await hook(raw, { salt: 's1', timestamp: 'abc', signature: 'x' }), false);
    assert.equal(await hook(raw, {}), false);
    assert.equal(await hook('', good), false);
    assert.equal(
      await adapter.verifyWebhook(
        { ...ctx, credentials: { ...ctx.credentials, webhookUrl: '' } },
        { rawBody: raw, headers: good },
      ),
      false,
    );
  });

  await check('webhooks: events', () => {
    const parse = (event: Json): ReturnType<typeof adapter.parseWebhook> =>
      adapter.parseWebhook({ rawBody: JSON.stringify(event), headers: {} });
    const captured = parse({
      id: 'wh_1',
      type: 'PAYMENT_CAPTURED',
      created_at: 1751898991,
      data: { id: PAY },
    });
    assert.equal(captured.type, 'payment.captured');
    assert.equal(captured.eventId, 'wh_1');
    assert.equal(captured.processorTransactionId, PAY);
    assert.equal(captured.occurredAt, '2025-07-07T14:36:31.000Z');
    assert.equal(
      parse({ token: 'wh_2', type: 'PAYMENT_FAILED', data: { id: PAY } }).eventId,
      'wh_2',
    );
    assert.equal(
      parse({ id: 'e', type: 'PAYMENT_CANCELED', data: { id: PAY } }).type,
      'payment.voided',
    );
    assert.equal(
      parse({ id: 'e', type: 'PAYMENT_EXPIRED', data: { id: PAY } }).type,
      'payment.voided',
    );
    assert.equal(
      parse({ id: 'e', type: 'PAYMENT_REVERSED', data: { id: PAY } }).type,
      'payment.voided',
    );
    const refund = parse({
      id: 'e',
      type: 'REFUND_COMPLETED',
      data: { id: 'refund_1', payment: PAY },
    });
    assert.equal(refund.type, 'payment.refunded');
    assert.equal(refund.processorTransactionId, PAY);
    const dispute = parse({
      id: 'e',
      type: 'PAYMENT_DISPUTE_CREATED',
      extended_timestamp: '1650949298936',
      data: { original_transaction_id: PAY },
    });
    assert.equal(dispute.type, 'dispute.opened');
    assert.equal(dispute.processorTransactionId, PAY);
    assert.equal(dispute.occurredAt, '2022-04-26T05:01:38.936Z');
    assert.equal(parse({ id: 'e', type: 'PAYMENT_SUCCEEDED', data: { id: PAY } }).type, 'unknown');
  });

  process.stdout.write(`step12-rapyd: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
