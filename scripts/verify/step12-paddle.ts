// path: scripts/verify/step12-paddle.ts
// Checks the Paddle adapter against a local fake transport that answers with the response shapes of Paddle's OpenAPI
// description (docs/processors/paddle.md). It does NOT replace the sandbox run listed in docs/processors/paddle.verify.md.
// Run: npx tsx --conditions=react-server scripts/verify/step12-paddle.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { adapter } from '@/lib/payment/adapters/paddle';
import {
  cardIdentity,
  fromAdjustment,
  fromTransaction,
} from '@/lib/payment/adapters/paddle/mapping';
import {
  SIGNATURE_TOLERANCE_SECONDS,
  verifyPaddleWebhook,
} from '@/lib/payment/adapters/paddle/webhook';
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
    apiKey: 'pdl_sdbx_apikey_01hxxxxxxxxxxxxxxxxxxxxxxx',
    clientToken: 'test_0123456789abcdef',
    webhookSecret: 'pdl_ntfset_01hxxxxxxxxxxxxxxxxxxxxxxx',
  },
  environment: 'sandbox',
  mode: 'paddle_checkout',
  correlationId: 'c1',
};
const TXN = 'txn_01hv8wptq8987qeep44cy4s8zp';
const ITEM = 'txnitm_01hv8wptq8987qeep44cy4s8zq';
const input: AuthorizeInput = {
  idempotencyKey: 'a3c1f2d4-1111-4222-8333-444455556666:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'inv-uuid-1',
  companyId: 'co',
  paymentToken: TXN,
  billing: { postalCode: null, country: null },
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
      text: JSON.stringify({
        error: { type: 'request_error', code: 'not_found', detail: 'x' },
        meta: {},
      }),
      headers: {},
    };
  const reply = typeof found === 'function' ? found(request) : found;
  return { status: reply.status ?? 200, text: JSON.stringify(reply.body), headers: {} };
});

const attempt = (status: string, over: Json = {}): Json => ({
  payment_attempt_id: 'a1',
  amount: '12050',
  status,
  error_code: null,
  created_at: '2026-10-18T10:00:00Z',
  method_details: {
    type: 'card',
    card: {
      type: 'visa',
      last4: '4242',
      expiry_month: 12,
      expiry_year: 2030,
      cardholder_name: 'Jo',
    },
  },
  ...over,
});
const txn = (status: string, over: Json = {}, attempts: Json[] = []): Json => ({
  data: {
    id: TXN,
    status,
    currency_code: 'USD',
    custom_data: { invoice_id: 'inv-uuid-1', company_id: 'co' },
    checkout: { url: 'https://pay.example.com/?_ptxn=' + TXN },
    details: {
      totals: { subtotal: '12050', tax: '0', total: '12050', grand_total: '12050', balance: '0' },
      line_items: [{ id: ITEM, quantity: 1 }],
    },
    payments: attempts,
    ...over,
  },
  meta: { request_id: 'r' },
});
const adjustment = (status: string, total = '2500'): Json => ({
  data: { id: 'adj_01hv8x', action: 'refund', status, transaction_id: TXN, totals: { total } },
  meta: {},
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
const session = (c: AdapterContext = ctx): ReturnType<typeof adapter.createCheckoutSession> =>
  adapter.createCheckoutSession(c, {
    idempotencyKey: 'k',
    amount: input.amount,
    invoiceId: 'inv-uuid-1',
    companyId: 'co',
    returnUrl: input.returnUrl,
    threeDS: 'disabled',
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
      if (field.pattern)
        assert.ok(new RegExp(field.pattern).test(ctx.credentials[field.key] ?? ''), field.key);
  });

  await check('checkout session: exact transaction request, public data only', async () => {
    route('POST /transactions', { status: 201, body: txn('draft') });
    const result = await session();
    assert.deepEqual(result.clientConfig, {
      transactionId: TXN,
      clientToken: 'test_0123456789abcdef',
      environment: 'sandbox',
    });
    assert.ok(!JSON.stringify(result).includes(ctx.credentials.apiKey ?? 'x'));
    const request = seen[0];
    assert.equal(request?.url, 'https://sandbox-api.paddle.com/transactions');
    assert.equal(request?.headers.authorization, `Bearer ${ctx.credentials.apiKey}`);
    assert.deepEqual(bodyOf(request), {
      items: [
        {
          quantity: 1,
          price: {
            description: 'Invoice inv-uuid-1',
            name: 'Invoice payment',
            tax_mode: 'internal',
            unit_price: { amount: '12050', currency_code: 'USD' },
            product: { name: 'Invoice payment', tax_category: 'standard' },
          },
        },
      ],
      currency_code: 'USD',
      collection_mode: 'automatic',
      custom_data: { invoice_id: 'inv-uuid-1', company_id: 'co' },
    });
    // live host
    setup();
    route('POST /transactions', { status: 201, body: txn('draft') });
    await session({ ...ctx, environment: 'live' });
    assert.equal(seen[0]?.url, 'https://api.paddle.com/transactions');
  });

  await check('checkout session: refusals', async () => {
    route('POST /transactions', {
      status: 400,
      body: { error: { type: 'request_error', code: 'invalid_field', detail: 'x' }, meta: {} },
    });
    await assert.rejects(session(), /invalid_field/);
    route('POST /transactions', { status: 201, body: txn('draft', { id: 'bogus' }) });
    await assert.rejects(session(), ValidationError);
    await assert.rejects(
      session({ ...ctx, credentials: { ...ctx.credentials, clientToken: '' } }),
      ValidationError,
    );
    route('POST /transactions', { status: 403, body: {} });
    await assert.rejects(session(), ValidationError);
    route('POST /transactions', { status: 500, body: {} });
    await assert.rejects(session(), /unavailable/);
  });

  await check('charge and authorize: a completed transaction is a sale', async () => {
    route(`GET /transactions/${TXN}`, { body: txn('completed', {}, [attempt('captured')]) });
    for (const call of [adapter.charge, adapter.authorize]) {
      const result = await call?.(ctx, input);
      assert.equal(result?.status, 'captured');
      assert.equal(result?.processorTransactionId, TXN);
      assert.ok(result?.amount.eq('120.50'));
      assert.deepEqual(result?.cardIdentity, {
        type: 'fingerprint',
        value: '4242|12/2030|visa',
        last4: '4242',
        brand: 'visa',
      });
      assert.deepEqual(result?.threeDS, {
        requested: false,
        completed: false,
        authenticated: false,
        liabilityShift: null,
      });
    }
    route(`GET /transactions/${TXN}`, { body: txn('paid', {}, [attempt('captured')]) });
    assert.equal((await adapter.charge?.(ctx, input))?.status, 'captured');
  });

  await check('charge: not completed, failed, canceled, other invoice, other amount', async () => {
    route(`GET /transactions/${TXN}`, { body: txn('ready') });
    const open = await adapter.charge?.(ctx, input);
    assert.deepEqual([open?.status, open?.rawCode], ['declined', 'CHECKOUT_NOT_COMPLETED']);
    route(`GET /transactions/${TXN}`, {
      body: txn('ready', {}, [attempt('error', { error_code: 'not_enough_balance' })]),
    });
    const failed = await adapter.charge?.(ctx, input);
    assert.deepEqual(
      [failed?.status, failed?.declineCategory, failed?.rawCode],
      ['declined', 'insufficient_funds', 'not_enough_balance'],
    );
    route(`GET /transactions/${TXN}`, { body: txn('canceled') });
    assert.equal((await adapter.charge?.(ctx, input))?.status, 'voided');
    route(`GET /transactions/${TXN}`, {
      body: txn('completed', { custom_data: { invoice_id: 'other' } }, [attempt('captured')]),
    });
    assert.equal((await adapter.charge?.(ctx, input))?.rawCode, 'TRANSACTION_MISMATCH');
    route(`GET /transactions/${TXN}`, {
      body: txn('completed', { details: { totals: { grand_total: '12051' }, line_items: [] } }),
    });
    assert.equal((await adapter.charge?.(ctx, input))?.rawCode, 'TRANSACTION_MISMATCH');
    route(`GET /transactions/${TXN}`, { body: txn('completed', { currency_code: 'EUR' }) });
    assert.equal((await adapter.charge?.(ctx, input))?.rawCode, 'TRANSACTION_MISMATCH');
    setup();
    assert.equal((await adapter.charge?.(ctx, input))?.rawCode, 'TRANSACTION_NOT_FOUND');
    await assert.rejects(
      adapter.charge?.(ctx, { ...input, paymentToken: '../x' }) ?? Promise.resolve(),
      ValidationError,
    );
  });

  await check(
    'refund: whole payment, part of a payment, waiting for Paddle, refusals',
    async () => {
      route(`GET /transactions/${TXN}`, { body: txn('completed', {}, [attempt('captured')]) });
      route('POST /adjustments', { status: 201, body: adjustment('approved', '12050') });
      const whole = await adapter.refund(ctx, {
        idempotencyKey: 'k',
        processorTransactionId: TXN,
        amount: input.amount,
        reason: 'duplicate order',
      });
      assert.deepEqual([whole.status, whole.processorTransactionId], ['refunded', 'adj_01hv8x']);
      assert.deepEqual(bodyOf(seen.find((r) => r.url.endsWith('/adjustments'))), {
        action: 'refund',
        transaction_id: TXN,
        reason: 'duplicate order',
        type: 'full',
      });
      seen.length = 0;
      route('POST /adjustments', { status: 201, body: adjustment('pending_approval') });
      const part = await adapter.refund(ctx, {
        idempotencyKey: 'k',
        processorTransactionId: TXN,
        amount: Money.parse('25.00'),
        reason: null,
      });
      assert.deepEqual([part.status, part.processorTransactionId], ['pending', 'adj_01hv8x']);
      assert.deepEqual(bodyOf(seen.find((r) => r.url.endsWith('/adjustments'))), {
        action: 'refund',
        transaction_id: TXN,
        reason: 'Refund requested',
        type: 'partial',
        items: [{ item_id: ITEM, type: 'partial', amount: '2500' }],
      });
      route('POST /adjustments', { status: 201, body: adjustment('rejected') });
      assert.equal(
        (
          await adapter.refund(ctx, {
            idempotencyKey: 'k',
            processorTransactionId: TXN,
            amount: input.amount,
            reason: null,
          })
        ).status,
        'declined',
      );
      route('POST /adjustments', {
        status: 400,
        body: {
          error: { type: 'request_error', code: 'transaction_not_permitted', detail: 'x' },
          meta: {},
        },
      });
      const bad = await adapter.refund(ctx, {
        idempotencyKey: 'k',
        processorTransactionId: TXN,
        amount: input.amount,
        reason: null,
      });
      assert.deepEqual([bad.status, bad.declineCategory], ['declined', 'do_not_honor']);
      // refusals before any adjustment
      seen.length = 0;
      assert.equal(
        (
          await adapter.refund(ctx, {
            idempotencyKey: 'k',
            processorTransactionId: TXN,
            amount: Money.parse('120.51'),
            reason: null,
          })
        ).rawCode,
        'REFUND_AMOUNT_INVALID',
      );
      route(`GET /transactions/${TXN}`, { body: txn('ready') });
      assert.equal(
        (
          await adapter.refund(ctx, {
            idempotencyKey: 'k',
            processorTransactionId: TXN,
            amount: input.amount,
            reason: null,
          })
        ).rawCode,
        'TRANSACTION_NOT_REFUNDABLE',
      );
      route(`GET /transactions/${TXN}`, {
        body: txn('completed', { details: { totals: { grand_total: '12050' }, line_items: [] } }),
      });
      assert.equal(
        (
          await adapter.refund(ctx, {
            idempotencyKey: 'k',
            processorTransactionId: TXN,
            amount: Money.parse('5.00'),
            reason: null,
          })
        ).rawCode,
        'REFUND_ITEM_UNKNOWN',
      );
      assert.equal(seen.filter((r) => r.url.endsWith('/adjustments')).length, 0);
      setup();
      assert.equal(
        (
          await adapter.refund(ctx, {
            idempotencyKey: 'k',
            processorTransactionId: TXN,
            amount: input.amount,
            reason: null,
          })
        ).rawCode,
        'TRANSACTION_NOT_FOUND',
      );
    },
  );

  await check('states, card identity, adjustments, lookup', async () => {
    const state = (status: string, attempts: Json[] = []): string =>
      fromTransaction(txn(status, {}, attempts).data as Json, null).status;
    assert.equal(state('completed'), 'captured');
    assert.equal(state('paid'), 'captured');
    assert.equal(state('canceled'), 'voided');
    for (const s of ['draft', 'ready', 'billed', 'past_due']) assert.equal(state(s), 'pending', s);
    assert.equal(state('mystery'), 'error');
    assert.equal(state('ready', [attempt('error', { error_code: 'declined' })]), 'declined');
    assert.equal(cardIdentity(null), null);
    assert.equal(cardIdentity({ method_details: { type: 'paypal', card: null } }), null);
    assert.equal(
      fromAdjustment({ id: 'a', status: 'approved', totals: { total: '100' } }, Money.parse('1.00'))
        .status,
      'refunded',
    );
    assert.equal(
      fromAdjustment({ id: 'a', status: 'reversed' }, Money.parse('1.00')).status,
      'declined',
    );
    route(`GET /transactions/${TXN}`, { body: txn('completed') });
    assert.equal((await adapter.getTransaction(ctx, TXN)).status, 'captured');
    setup();
    await assert.rejects(adapter.getTransaction(ctx, TXN), ValidationError);
    await assert.rejects(adapter.getTransaction(ctx, 'adj_1'), ValidationError);
  });

  await check('decline mapping and connection test', async () => {
    for (const [code, category] of [
      ['not_enough_balance', 'insufficient_funds'],
      ['invalid_payment_details', 'invalid_number'],
      ['expired_card', 'invalid_expiry'],
      ['authentication_failed', 'three_ds_failed'],
      ['fraud', 'processor_fraud_signal'],
      ['declined', 'do_not_honor'],
      ['system_error', 'processor_error'],
      ['unknown', 'other'],
    ] as const)
      assert.equal(adapter.mapDecline({ code, message: null }), category, code);
    route('GET /transactions', { body: { data: [], meta: {} } });
    assert.equal((await adapter.testConnection(ctx)).ok, true);
    assert.equal(seen[0]?.url, 'https://sandbox-api.paddle.com/transactions?per_page=1');
    route('GET /transactions', { status: 403, body: {} });
    const bad = await adapter.testConnection(ctx);
    assert.equal(bad.ok, false);
    assert.ok(!bad.message.includes(ctx.credentials.apiKey ?? 'x'));
    route('GET /transactions', { status: 503, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    route('GET /transactions', { status: 400, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
  });

  const body = JSON.stringify({
    event_id: 'evt_01hv8x',
    event_type: 'transaction.completed',
    occurred_at: '2026-10-18T10:00:00.000000Z',
    notification_id: 'ntf_1',
    data: { id: TXN, status: 'completed' },
  });
  const NOW = 1_760_000_000;
  const sign = (ts: number, raw = body, secret = ctx.credentials.webhookSecret ?? ''): string =>
    `ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:${raw}`).digest('hex')}`;
  const verify = (header: string | undefined, raw = body, now = NOW * 1000): Promise<boolean> =>
    verifyPaddleWebhook(
      ctx,
      { headers: header === undefined ? {} : { 'paddle-signature': header }, rawBody: raw },
      now,
    );

  await check('webhook: ts:body HMAC with a five second window', async () => {
    assert.equal(SIGNATURE_TOLERANCE_SECONDS, 5);
    assert.equal(await verify(sign(NOW)), true);
    assert.equal(await verify(sign(NOW - 5)), true);
    assert.equal(await verify(sign(NOW - 6)), false);
    assert.equal(await verify(sign(NOW + 60)), true);
    assert.equal(await verify(sign(NOW, body, 'pdl_ntfset_wrong')), false);
    assert.equal(await verify(sign(NOW), body.replace('completed', 'canceled')), false);
    assert.equal(await verify(sign(NOW).replace(`ts=${NOW}`, `ts=${NOW - 1}`)), false);
    assert.equal(await verify(undefined), false);
    assert.equal(await verify(''), false);
    assert.equal(await verify(`ts=${NOW}`), false);
    assert.equal(await verify(`h1=${'a'.repeat(64)}`), false);
    assert.equal(await verify(`ts=abc;h1=${'a'.repeat(64)}`), false);
    assert.equal(await verify(`ts=${NOW};h1=nothex`), false);
    assert.equal(await verify(sign(NOW), ''), false);
    assert.equal(
      await verifyPaddleWebhook(
        { ...ctx, credentials: { ...ctx.credentials, webhookSecret: '' } },
        { headers: { 'paddle-signature': sign(NOW, body, '') }, rawBody: body },
        NOW * 1000,
      ),
      false,
    );
    assert.equal(seen.length, 0);
  });

  await check('webhook: event mapping', () => {
    const parse = (type: string, data: Json): ReturnType<typeof adapter.parseWebhook> =>
      adapter.parseWebhook({
        headers: {},
        rawBody: JSON.stringify({
          event_id: `e-${type}`,
          event_type: type,
          occurred_at: '2026-10-18T10:00:00Z',
          data,
        }),
      });
    const base = parse('transaction.completed', { id: TXN });
    assert.deepEqual(
      [base.processorId, base.eventId, base.type, base.processorTransactionId, base.occurredAt],
      ['paddle', 'e-transaction.completed', 'payment.captured', TXN, '2026-10-18T10:00:00.000Z'],
    );
    assert.equal(parse('transaction.payment_failed', { id: TXN }).type, 'payment.failed');
    assert.equal(parse('transaction.canceled', { id: TXN }).type, 'payment.voided');
    assert.equal(parse('transaction.updated', { id: TXN }).type, 'unknown');
    assert.equal(parse('transaction.updated', { id: TXN }).processorTransactionId, TXN);
    const refund = parse('adjustment.updated', {
      id: 'adj_1',
      action: 'refund',
      status: 'approved',
      transaction_id: TXN,
    });
    assert.deepEqual(
      [refund.type, refund.processorTransactionId, refund.payload.adjustmentId],
      ['payment.refunded', TXN, 'adj_1'],
    );
    assert.equal(
      parse('adjustment.updated', {
        id: 'a',
        action: 'refund',
        status: 'pending_approval',
        transaction_id: TXN,
      }).type,
      'unknown',
    );
    assert.equal(
      parse('adjustment.created', {
        id: 'a',
        action: 'chargeback',
        status: 'pending_approval',
        transaction_id: TXN,
      }).type,
      'dispute.opened',
    );
    assert.equal(
      parse('adjustment.updated', {
        id: 'a',
        action: 'chargeback',
        status: 'approved',
        transaction_id: TXN,
      }).type,
      'dispute.updated',
    );
    assert.equal(parse('customer.created', { id: 'ctm_1' }).processorTransactionId, null);
    assert.throws(() => adapter.parseWebhook({ headers: {}, rawBody: 'x' }));
  });

  setTransportForVerification(null);
  process.stdout.write(`step12-paddle: ${checks} checks passed\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
