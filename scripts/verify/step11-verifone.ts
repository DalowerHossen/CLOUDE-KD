// path: scripts/verify/step11-verifone.ts
// Checks the Verifone adapter against a local fake transport that answers with the response shapes of Verifone's
// OpenAPI specifications and documentation (docs/processors/verifone.md). It does NOT replace the sandbox run listed in
// docs/processors/verifone.verify.md. Run: npx tsx --conditions=react-server scripts/verify/step11-verifone.ts
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync, constants } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { adapter } from '@/lib/payment/adapters/verifone';
import { idempotencyUuid } from '@/lib/payment/adapters/verifone/api';
import { cardIdentity, fromStored } from '@/lib/payment/adapters/verifone/mapping';
import {
  canonicalJson,
  resetKeyCacheForVerification,
} from '@/lib/payment/adapters/verifone/webhook';
import { adapterProblems } from '@/lib/payment/capabilities';
import {
  setTransportForVerification,
  type HttpRequest,
  type HttpResponse,
} from '@/lib/payment/http-client';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, AuthorizeInput } from '@/types/contracts';

const CK = '38615263-ed67-4774-bddd-7407edc0b700';
const TX = '927bdeb4-afb9-44ff-9bf2-6348e2080c82';
const ENTITY = '07652580-1037-4901-92f2-74676cb8aa7e';
const HOST = 'https://cst.test-gsc.vfims.com';
const ctx: AdapterContext = {
  credentials: {
    region: 'global',
    userId: '777c31b3-a85f-4823-93a5-9055d1b',
    apiKey: 'cGEFFLjYuUCtmerXlhTfAdaPpYVnXDJZmg',
    entityId: ENTITY,
    paymentContractId: '8d3c506b-5585-4c1c-8530-2319237f6385',
  },
  environment: 'sandbox',
  mode: 'iframe_checkout',
  correlationId: 'c1',
};
const input: AuthorizeInput = {
  idempotencyKey: 'a3c1f2d4-1111-4222-8333-444455556666:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'inv-uuid-1',
  companyId: 'co',
  paymentToken: CK,
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

const CHECKOUT_PATH = `/oidc/checkout-service/v2/checkout/${CK}`;
const STORED_PATH = `/oidc/api/v2/transaction/${TX}`;
const payment = (status: string, over: Json = {}): Json => ({
  id: TX,
  amount: 12050,
  status,
  reason_code: '0000',
  merchant_reference: 'inv-uuid-1',
  payment_product: 'CARD',
  details: { auto_capture: false },
  ...over,
});
const outcomeEvent = (
  type: string,
  details: Json,
  timestamp = '2026-10-17T10:00:00.000Z',
): Json => ({
  type,
  id: `ev-${type}-${timestamp}`,
  timestamp,
  details,
});
const checkout = (over: Json = {}, events?: Json[]): Json => ({
  id: CK,
  entity_id: ENTITY,
  merchant_reference: 'inv-uuid-1',
  currency_code: 'USD',
  amount: 12050,
  transaction_id: TX,
  events: events ?? [outcomeEvent('TRANSACTION_SUCCESS', payment('AUTHORIZED'))],
  ...over,
});
const stored = (over: Json = {}): Json => ({
  id: TX,
  transaction_type: 'AUTHORISATION',
  transaction_status: 'AUTHORISED',
  amount: '120.50',
  currency_code: 'USD',
  masked_card_number: '430000******7107',
  card_brand: 'VISA',
  reason_code: '0000',
  ...over,
});
const bodyOf = (r: HttpRequest | undefined): Json => JSON.parse(r?.body ?? '{}') as Json;
const callsTo = (suffix: string): HttpRequest[] =>
  seen.filter((r) => new URL(r.url).pathname.endsWith(suffix));

function setup(): void {
  routes = new Map();
  seen.length = 0;
  resetKeyCacheForVerification();
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

// Signing helpers for the notification checks (RFC 7515 detached, RFC 7797 unencoded payload, RFC 8785 body).
const JWKS_PATH = '/test-webhook-sign-keys/test-webhook-sign-keys.jwks';
interface Signer {
  kid: string;
  alg: string;
  privateKey: KeyObject;
  jwk: Json;
}
function makeSigner(kind: 'ES256' | 'RS256' | 'PS256', kid: string): Signer {
  const pair =
    kind === 'ES256'
      ? generateKeyPairSync('ec', { namedCurve: 'P-256' })
      : generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...(pair.publicKey.export({ format: 'jwk' }) as Json), kid, alg: kind, use: 'sig' };
  return { kid, alg: kind, privateKey: pair.privateKey, jwk };
}
function sign(
  signer: Signer,
  body: string,
  header: Json = {},
  canonical: string = canonicalJson(JSON.parse(body)),
): string {
  const protectedPart = Buffer.from(
    JSON.stringify({ alg: signer.alg, kid: signer.kid, b64: false, crit: ['b64'], ...header }),
  ).toString('base64url');
  const data = Buffer.from(`${protectedPart}.${canonical}`, 'utf8');
  let signature: Buffer;
  if (signer.alg === 'ES256') {
    signature = createSign('sha256')
      .update(data)
      .sign({ key: signer.privateKey, dsaEncoding: 'ieee-p1363' });
  } else if (signer.alg === 'PS256') {
    signature = createSign('sha256')
      .update(data)
      .sign({ key: signer.privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 });
  } else {
    signature = createSign('sha256').update(data).sign(signer.privateKey);
  }
  return `${protectedPart}..${signature.toString('base64url')}`;
}
const publishKeys = (...signers: Signer[]): void =>
  route(`GET ${JWKS_PATH}`, { body: { keys: signers.map((s) => s.jwk) } });

async function main(): Promise<void> {
  await check('contract is complete', () => {
    assert.deepEqual(adapterProblems(adapter), []);
    assert.deepEqual(
      adapter.credentialFields.map((f) => [f.key, f.secret]),
      [
        ['region', false],
        ['userId', false],
        ['apiKey', true],
        ['entityId', false],
        ['paymentContractId', false],
      ],
    );
    assert.equal(adapter.capabilities.supportsThreeDS, false);
    assert.deepEqual(adapter.capabilities.currencies, ['USD']);
    for (const field of adapter.credentialFields)
      if (field.pattern)
        assert.ok(new RegExp(field.pattern).test(ctx.credentials[field.key] ?? ''), field.key);
  });

  await check('checkout session: exact request, public data only', async () => {
    route('POST /oidc/checkout-service/v2/checkout', {
      status: 201,
      body: { id: CK, url: `${HOST}/oidc/checkout-service/v2/loader.js?checkoutId=${CK}` },
    });
    const session = await adapter.createCheckoutSession(ctx, {
      idempotencyKey: 'k',
      amount: input.amount,
      invoiceId: 'inv-uuid-1',
      companyId: 'co',
      returnUrl: input.returnUrl,
      threeDS: 'disabled',
    });
    assert.deepEqual(Object.keys(session.clientConfig).sort(), ['checkoutId', 'loaderUrl']);
    assert.equal(session.clientConfig.checkoutId, CK);
    assert.ok(session.expiresAt && !Number.isNaN(Date.parse(session.expiresAt)));
    const request = seen[0];
    assert.equal(request?.url, `${HOST}/oidc/checkout-service/v2/checkout`);
    assert.match(request?.headers.authorization ?? '', /^Basic [A-Za-z0-9+/=]+$/);
    assert.equal(
      Buffer.from((request?.headers.authorization ?? '').slice(6), 'base64').toString('utf8'),
      `${ctx.credentials.userId}:${ctx.credentials.apiKey}`,
    );
    assert.deepEqual(bodyOf(request), {
      entity_id: ENTITY,
      currency_code: 'USD',
      amount: 12050,
      merchant_reference: 'inv-uuid-1',
      interaction_type: 'IFRAME',
      show_confirmation_page: false,
      configurations: {
        card: {
          mode: 'PAYMENT',
          payment_contract_id: ctx.credentials.paymentContractId,
          capture_now: false,
        },
      },
    });
    assert.ok(!JSON.stringify(session).includes(ctx.credentials.apiKey ?? 'x'));
  });

  await check('checkout session: refusals', async () => {
    const make = (): ReturnType<typeof adapter.createCheckoutSession> =>
      adapter.createCheckoutSession(ctx, {
        idempotencyKey: 'k',
        amount: input.amount,
        invoiceId: '=bad-start',
        companyId: 'co',
        returnUrl: input.returnUrl,
        threeDS: 'disabled',
      });
    route('POST /oidc/checkout-service/v2/checkout', {
      body: { id: CK, url: `https://evil.example.com/v2/loader.js?checkoutId=${CK}` },
    });
    await assert.rejects(make(), ValidationError);
    assert.equal(bodyOf(seen[0]).merchant_reference, 'i=bad-start');
    route('POST /oidc/checkout-service/v2/checkout', {
      body: { id: CK, url: `${HOST}/oidc/checkout-service/v2/loader.js?checkoutId=other-id-0000` },
    });
    await assert.rejects(make(), ValidationError);
    route('POST /oidc/checkout-service/v2/checkout', {
      status: 400,
      body: { code: 126, message: 'm' },
    });
    await assert.rejects(make(), /code 126/);
    await assert.rejects(
      adapter.createCheckoutSession(
        { ...ctx, credentials: { ...ctx.credentials, entityId: '' } },
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
  });

  await check('region must fit the environment', async () => {
    const wrong = { ...ctx, credentials: { ...ctx.credentials, region: 'emea' } };
    const result = await adapter.testConnection(wrong);
    assert.equal(result.ok, false);
    assert.equal(seen.length, 0);
    const live = {
      ...ctx,
      environment: 'live' as const,
      credentials: { ...ctx.credentials, region: 'global' },
    };
    assert.equal((await adapter.testConnection(live)).ok, false);
    assert.equal(seen.length, 0);
    route('GET /oidc/api/v2/transactions', { body: [] });
    const nz = {
      ...ctx,
      environment: 'live' as const,
      credentials: { ...ctx.credentials, region: 'nz' },
    };
    assert.equal((await adapter.testConnection(nz)).ok, true);
    assert.equal(seen[0]?.url, 'https://nz.gsc.verifone.cloud/oidc/api/v2/transactions?_limit=1');
    seen.length = 0;
    const us = { ...ctx, credentials: { ...ctx.credentials, region: 'us' } };
    await adapter.testConnection(us);
    assert.ok(seen[0]?.url.startsWith('https://uscst-gb.gsc.vficloud.net/oidc/'));
  });

  await check('authorize: success is verified against the invoice', async () => {
    route(`GET ${CHECKOUT_PATH}`, { body: checkout() });
    route(`GET ${STORED_PATH}`, { body: stored() });
    const result = await adapter.authorize(ctx, input);
    assert.equal(result.status, 'authorized');
    assert.equal(result.processorTransactionId, TX);
    assert.ok(result.amount.eq(input.amount));
    assert.deepEqual(result.cardIdentity, {
      type: 'fingerprint',
      value: '430000|7107|VISA',
      last4: '7107',
      brand: 'visa',
    });
    assert.equal(result.avsPostalCodeMatch, null);
    assert.deepEqual(result.threeDS, {
      requested: false,
      completed: false,
      authenticated: false,
      liabilityShift: null,
    });
    assert.equal(result.rawCode, '0000');
    assert.deepEqual(
      seen.map((r) => r.method),
      ['GET', 'GET'],
    );
    assert.equal(adapter.cardIdentity(result)?.value, '430000|7107|VISA');
  });

  await check(
    'authorize: card token wins over the masked number; read failure is not fatal',
    async () => {
      route(`GET ${CHECKOUT_PATH}`, {
        body: checkout({}, [
          outcomeEvent('TRANSACTION_SUCCESS', payment('AUTHORIZED', { card: 'tok-123' })),
        ]),
      });
      const withToken = await adapter.authorize(ctx, input);
      assert.deepEqual(withToken.cardIdentity, { type: 'token', value: 'tok-123' });
      route(`GET ${CHECKOUT_PATH}`, { body: checkout() });
      route(`GET ${STORED_PATH}`, { status: 404, body: {} });
      const without = await adapter.authorize(ctx, input);
      assert.equal(without.status, 'authorized');
      assert.equal(without.cardIdentity, null);
    },
  );

  await check('authorize: a different checkout is refused', async () => {
    const cases: Json[] = [
      { entity_id: 'other-entity-0001' },
      { merchant_reference: 'inv-uuid-2' },
      { currency_code: 'EUR' },
      { amount: 12051 },
      { amount: '12050' },
    ];
    for (const over of cases) {
      route(`GET ${CHECKOUT_PATH}`, { body: checkout(over) });
      const result = await adapter.authorize(ctx, input);
      assert.equal(result.status, 'declined', JSON.stringify(over));
      assert.equal(result.rawCode, 'CHECKOUT_MISMATCH');
    }
    route(`GET ${CHECKOUT_PATH}`, { body: checkout({ transaction_id: 'another-transaction-1' }) });
    assert.equal((await adapter.authorize(ctx, input)).rawCode, 'CHECKOUT_MISMATCH');
    assert.equal(callsTo('/void').length, 0);
  });

  await check('authorize: not finished, unknown, bad token', async () => {
    route(`GET ${CHECKOUT_PATH}`, { body: checkout({ transaction_id: undefined }, []) });
    const open = await adapter.authorize(ctx, input);
    assert.equal(open.status, 'declined');
    assert.equal(open.rawCode, 'CHECKOUT_NOT_COMPLETED');
    setup();
    const unknown = await adapter.authorize(ctx, input);
    assert.equal(unknown.rawCode, '109');
    await assert.rejects(
      adapter.authorize(ctx, { ...input, paymentToken: '../x' }),
      ValidationError,
    );
    await assert.rejects(adapter.authorize(ctx, { ...input, paymentToken: '' }), ValidationError);
  });

  await check('authorize: failed and declined attempts, newest outcome wins', async () => {
    route(`GET ${CHECKOUT_PATH}`, {
      body: checkout({ transaction_id: undefined }, [
        outcomeEvent(
          'TRANSACTION_DECLINED',
          payment('DECLINED', { reason_code: '1016', id: 'declined-tx-0001' }),
        ),
      ]),
    });
    const declined = await adapter.authorize(ctx, input);
    assert.equal(declined.status, 'declined');
    assert.equal(declined.declineCategory, 'insufficient_funds');
    assert.equal(declined.rawCode, '1016');
    route(`GET ${CHECKOUT_PATH}`, {
      body: checkout({ transaction_id: undefined }, [
        outcomeEvent('TRANSACTION_FAILED', payment('FAILED', { reason_code: '9109' })),
      ]),
    });
    assert.equal((await adapter.authorize(ctx, input)).declineCategory, 'processor_error');
    route(`GET ${CHECKOUT_PATH}`, {
      body: checkout({}, [
        outcomeEvent('TRANSACTION_SUCCESS', payment('AUTHORIZED'), '2026-10-17T10:05:00.000Z'),
        outcomeEvent(
          'TRANSACTION_DECLINED',
          payment('DECLINED', { reason_code: '1000', id: 'declined-tx-0002' }),
          '2026-10-17T10:01:00.000Z',
        ),
      ]),
    });
    route(`GET ${STORED_PATH}`, { body: stored() });
    assert.equal((await adapter.authorize(ctx, input)).status, 'authorized');
  });

  await check('authorize: auto-capture flag, held amount different from the invoice', async () => {
    route(`GET ${CHECKOUT_PATH}`, {
      body: checkout({}, [
        outcomeEvent(
          'TRANSACTION_SUCCESS',
          payment('AUTHORIZED', { details: { auto_capture: true } }),
        ),
      ]),
    });
    route(`GET ${STORED_PATH}`, { body: stored() });
    assert.equal((await adapter.authorize(ctx, input)).status, 'captured');
    setup();
    route(`GET ${CHECKOUT_PATH}`, {
      body: checkout({}, [
        outcomeEvent('TRANSACTION_SUCCESS', payment('AUTHORIZED', { amount: 9999 })),
      ]),
    });
    route(`GET ${STORED_PATH}`, { body: stored() });
    route(`POST ${STORED_PATH.replace('/transaction/', '/transactions/')}/void`, {
      status: 201,
      body: payment('AUTHORIZATION_VOIDED'),
    });
    const mismatch = await adapter.authorize(ctx, input);
    assert.equal(mismatch.status, 'declined');
    assert.equal(mismatch.rawCode, 'AMOUNT_MISMATCH');
    assert.equal(callsTo('/void').length, 1);
  });

  await check('authentication and outage errors throw', async () => {
    route(`GET ${CHECKOUT_PATH}`, { status: 401, body: { code: 116, message: 'x' } });
    const failure = await adapter.authorize(ctx, input).catch((e: unknown) => e);
    assert.ok(failure instanceof ValidationError);
    assert.ok(!(failure as Error).message.includes(ctx.credentials.apiKey ?? 'x'));
    route(`GET ${CHECKOUT_PATH}`, { status: 403, body: { code: 113, message: 'x' } });
    await assert.rejects(adapter.authorize(ctx, input), ValidationError);
    route(`GET ${CHECKOUT_PATH}`, { status: 504, body: { code: 170, message: 'x' } });
    await assert.rejects(adapter.authorize(ctx, input), /unavailable/);
    route(`GET ${CHECKOUT_PATH}`, { status: 500, body: {} });
    await assert.rejects(adapter.authorize(ctx, input), /unavailable/);
    route(`GET ${CHECKOUT_PATH}`, { status: 403, body: { code: 111, message: 'x' } });
    const blocked = await adapter.authorize(ctx, input);
    assert.equal(blocked.declineCategory, 'processor_fraud_signal');
    await assert.rejects(
      adapter.authorize({ ...ctx, credentials: { ...ctx.credentials, apiKey: '' } }, input),
      ValidationError,
    );
  });

  await check('capture: full amount only, state read first', async () => {
    const path = '/oidc/api/v2/transactions';
    route(`GET ${STORED_PATH}`, { body: stored() });
    route(`POST ${path}/${TX}/capture`, { status: 201, body: payment('SETTLEMENT_REQUESTED') });
    const done = await adapter.capture?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
      amount: input.amount,
    });
    assert.equal(done?.status, 'captured');
    assert.equal(done?.processorTransactionId, TX);
    assert.deepEqual(bodyOf(callsTo('/capture')[0]), { amount: 12050 });
    // smaller amount, unknown, not authorized, bad id
    setup();
    route(`GET ${STORED_PATH}`, { body: stored() });
    const less = await adapter.capture?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
      amount: Money.parse('100.00'),
    });
    assert.equal(less?.rawCode, 'CAPTURE_AMOUNT_MISMATCH');
    assert.equal(callsTo('/capture').length, 0);
    setup();
    assert.equal(
      (
        await adapter.capture?.(ctx, {
          idempotencyKey: 'k',
          processorTransactionId: TX,
          amount: input.amount,
        })
      )?.rawCode,
      '109',
    );
    route(`GET ${STORED_PATH}`, {
      body: stored({ transaction_type: 'SALE', transaction_status: 'SETTLED' }),
    });
    const already = await adapter.capture?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
      amount: input.amount,
    });
    assert.equal(already?.status, 'captured');
    assert.equal(callsTo('/capture').length, 0);
    route(`GET ${STORED_PATH}`, { body: stored({ transaction_status: 'DECLINED' }) });
    assert.equal(
      (
        await adapter.capture?.(ctx, {
          idempotencyKey: 'k',
          processorTransactionId: TX,
          amount: input.amount,
        })
      )?.rawCode,
      'PAYMENT_NOT_CAPTURABLE',
    );
    await assert.rejects(
      Promise.resolve().then(() =>
        adapter.capture?.(ctx, {
          idempotencyKey: 'k',
          processorTransactionId: '../x',
          amount: input.amount,
        }),
      ),
      ValidationError,
    );
  });

  await check('capture: an answer that does not say captured is checked again', async () => {
    const path = '/oidc/api/v2/transactions';
    let reads = 0;
    route(`GET ${STORED_PATH}`, () => {
      reads += 1;
      return {
        body:
          reads === 1
            ? stored()
            : stored({ transaction_type: 'SALE', transaction_status: 'SETTLEMENT_REQUESTED' }),
      };
    });
    route(`POST ${path}/${TX}/capture`, { status: 201, body: payment('AUTHORIZED') });
    const result = await adapter.capture?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
      amount: input.amount,
    });
    assert.equal(result?.status, 'captured');
    setup();
    route(`GET ${STORED_PATH}`, { body: stored() });
    route(`POST ${path}/${TX}/capture`, { status: 201, body: payment('PENDING') });
    const waiting = await adapter.capture?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
      amount: input.amount,
    });
    assert.equal(waiting?.status, 'pending');
    setup();
    route(`GET ${STORED_PATH}`, { body: stored() });
    route(`POST ${path}/${TX}/capture`, { status: 400, body: { code: 123, message: 'x' } });
    const refused = await adapter.capture?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
      amount: input.amount,
    });
    assert.equal(refused?.status, 'declined');
    assert.equal(refused?.declineCategory, 'do_not_honor');
  });

  await check('void: only an uncaptured authorization', async () => {
    const path = `/oidc/api/v2/transactions/${TX}/void`;
    route(`GET ${STORED_PATH}`, { body: stored() });
    route(`POST ${path}`, { status: 201, body: payment('AUTHORIZATION_VOIDED') });
    const done = await adapter.voidAuthorization?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
    });
    assert.equal(done?.status, 'voided');
    assert.equal(done?.processorTransactionId, TX);
    assert.equal(callsTo('/void')[0]?.body, '{}');
    setup();
    route(`GET ${STORED_PATH}`, {
      body: stored({
        transaction_type: 'VOID',
        transaction_status: 'APPROVED',
        parent_id: TX,
        id: 'void-tx-000001',
      }),
    });
    // a void record read under the payment id is reported as voided without another call
    const again = await adapter.voidAuthorization?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
    });
    assert.equal(again?.status, 'voided');
    assert.equal(callsTo('/void').length, 0);
    setup();
    route(`GET ${STORED_PATH}`, {
      body: stored({ transaction_type: 'SALE', transaction_status: 'SETTLED' }),
    });
    const captured = await adapter.voidAuthorization?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
    });
    assert.equal(captured?.rawCode, 'PAYMENT_NOT_VOIDABLE');
    assert.equal(callsTo('/void').length, 0);
  });

  await check('refund: settled payment, queued capture, refusals', async () => {
    const base = '/oidc/api/v2/transactions';
    const refundInput = {
      idempotencyKey: 'a3c1f2d4-1111-4222-8333-444455556666:refund',
      processorTransactionId: TX,
      amount: Money.parse('25.00'),
      reason: 'requested by payer',
    };
    route(`GET ${STORED_PATH}`, {
      body: stored({ transaction_type: 'SALE', transaction_status: 'SETTLED' }),
    });
    route(`POST ${base}/${TX}/refund`, {
      status: 201,
      body: payment('REFUNDED', { id: 'refund-tx-000001', amount: 2500 }),
    });
    const refunded = await adapter.refund(ctx, refundInput);
    assert.equal(refunded.status, 'refunded');
    assert.equal(refunded.processorTransactionId, 'refund-tx-000001');
    assert.ok(refunded.amount.eq('25.00'));
    const call = callsTo('/refund')[0];
    assert.deepEqual(bodyOf(call), { amount: 2500, reason: 'requested by payer' });
    const key = call?.headers['x-vfi-api-idempotencykey'] ?? '';
    assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(key, idempotencyUuid(refundInput.idempotencyKey));
    assert.notEqual(key, idempotencyUuid('other-key'));
    // queued capture: whole amount through void_capture, partial refused
    setup();
    route(`GET ${STORED_PATH}`, {
      body: stored({ transaction_type: 'SALE', transaction_status: 'SETTLEMENT_REQUESTED' }),
    });
    route(`POST ${base}/${TX}/void_capture`, {
      status: 201,
      body: payment('SETTLEMENT_CANCELLED'),
    });
    const whole = await adapter.refund(ctx, { ...refundInput, amount: input.amount });
    assert.equal(whole.status, 'refunded');
    assert.equal(whole.processorTransactionId, TX);
    assert.equal(callsTo('/refund').length, 0);
    seen.length = 0;
    const partial = await adapter.refund(ctx, refundInput);
    assert.equal(partial.rawCode, 'REFUND_NOT_YET_SETTLED');
    assert.equal(seen.length, 1);
    // not captured, too large, unknown, refused by Verifone, pending
    setup();
    route(`GET ${STORED_PATH}`, { body: stored() });
    assert.equal((await adapter.refund(ctx, refundInput)).rawCode, 'PAYMENT_NOT_REFUNDABLE');
    route(`GET ${STORED_PATH}`, {
      body: stored({ transaction_type: 'SALE', transaction_status: 'SETTLED' }),
    });
    assert.equal(
      (await adapter.refund(ctx, { ...refundInput, amount: Money.parse('120.51') })).rawCode,
      'REFUND_AMOUNT_INVALID',
    );
    route(`POST ${base}/${TX}/refund`, { status: 400, body: { code: 123, message: 'x' } });
    const bad = await adapter.refund(ctx, refundInput);
    assert.deepEqual([bad.status, bad.declineCategory], ['declined', 'do_not_honor']);
    route(`POST ${base}/${TX}/refund`, {
      status: 201,
      body: payment('PENDING', { id: 'refund-tx-000002' }),
    });
    assert.equal((await adapter.refund(ctx, refundInput)).status, 'pending');
    setup();
    assert.equal((await adapter.refund(ctx, refundInput)).rawCode, '109');
  });

  await check('stored transaction states map to platform statuses', () => {
    const state = (type: string, status: string, over: Json = {}): string =>
      fromStored(stored({ transaction_type: type, transaction_status: status, ...over }), null)
        .status;
    assert.equal(state('AUTHORISATION', 'AUTHORISED'), 'authorized');
    assert.equal(state('PREAUTH', 'APPROVED'), 'authorized');
    assert.equal(state('SALE', 'APPROVED'), 'captured');
    assert.equal(state('SALE', 'SETTLED'), 'captured');
    assert.equal(state('CAPTURE', 'SETTLEMENT_REQUESTED'), 'captured');
    assert.equal(state('SALE', 'PARTIALLY_REFUNDED'), 'captured');
    assert.equal(state('SALE', 'REFUNDED'), 'refunded');
    assert.equal(state('REFUND', 'APPROVED'), 'refunded');
    assert.equal(state('VOID', 'APPROVED'), 'voided');
    assert.equal(state('SALE', 'CANCELLED'), 'voided');
    assert.equal(state('SALE', 'DECLINED'), 'declined');
    assert.equal(state('SALE', 'FAILED'), 'declined');
    assert.equal(state('SALE', 'ROUTING'), 'pending');
    assert.equal(state('SALE', 'NEVER_HEARD_OF_IT'), 'error');
    assert.equal(state('NON_FINANCIAL', 'APPROVED'), 'error');
    const refund = fromStored(
      stored({
        id: 'refund-tx-000001',
        transaction_type: 'REFUND',
        transaction_status: 'APPROVED',
        parent_id: TX,
      }),
      null,
    );
    assert.equal(refund.processorTransactionId, TX);
    const failed = fromStored(stored({ transaction_status: 'FAILED', reason_code: '1011' }), null);
    assert.deepEqual([failed.declineCategory, failed.rawCode], ['invalid_number', '1011']);
    assert.ok(fromStored(stored({ amount: 'not money' }), Money.parse('3.00')).amount.eq('3.00'));
    assert.deepEqual(cardIdentity(null, '4300 00** **** 7107', 'VISA'), {
      type: 'fingerprint',
      value: '430000|7107|VISA',
      last4: '7107',
      brand: 'visa',
    });
    assert.equal(cardIdentity(null, '4300**7107', 'VISA'), null);
    assert.equal(cardIdentity(null, null, 'VISA'), null);
  });

  await check('getTransaction', async () => {
    route(`GET ${STORED_PATH}`, {
      body: stored({ transaction_type: 'SALE', transaction_status: 'SETTLED' }),
    });
    const tx = await adapter.getTransaction(ctx, TX);
    assert.equal(tx.status, 'captured');
    assert.ok(tx.amount.eq('120.50'));
    setup();
    await assert.rejects(adapter.getTransaction(ctx, TX), ValidationError);
  });

  await check('decline mapping', () => {
    const cases: [string, string][] = [
      ['1016', 'insufficient_funds'],
      ['1011', 'invalid_number'],
      ['1001', 'invalid_expiry'],
      ['9124', 'invalid_cvv'],
      ['1815', 'three_ds_failed'],
      ['1002', 'processor_fraud_signal'],
      ['111', 'processor_fraud_signal'],
      ['1000', 'do_not_honor'],
      ['121', 'do_not_honor'],
      ['9111', 'processor_error'],
      ['170', 'processor_error'],
      ['4242', 'other'],
    ];
    for (const [code, category] of cases)
      assert.equal(adapter.mapDecline({ code, message: null }), category, code);
    assert.equal(adapter.mapDecline({ code: null, message: null }), 'other');
  });

  await check('connection test', async () => {
    route('GET /oidc/api/v2/transactions', { body: [] });
    const ok = await adapter.testConnection(ctx);
    assert.equal(ok.ok, true);
    assert.equal(seen[0]?.method, 'GET');
    route('GET /oidc/api/v2/transactions', { status: 401, body: { code: 116 } });
    const bad = await adapter.testConnection(ctx);
    assert.equal(bad.ok, false);
    assert.ok(!bad.message.includes(ctx.credentials.apiKey ?? 'x'));
    route('GET /oidc/api/v2/transactions', { status: 403, body: { code: 113 } });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    route('GET /oidc/api/v2/transactions', { status: 504, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    route('GET /oidc/api/v2/transactions', { status: 404, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
  });

  await check('canonical JSON follows RFC 8785', () => {
    const accent = String.fromCharCode(0xe9);
    const smile = String.fromCodePoint(0x1f600);
    assert.equal(
      canonicalJson({
        b: 1,
        a: [true, null, 'x'],
        c: { z: 1.5, y: accent, $: 100000000000000000000 },
      }),
      `{"a":[true,null,"x"],"b":1,"c":{"$":100000000000000000000,"y":"${accent}","z":1.5}}`,
    );
    assert.equal(
      canonicalJson({ [accent]: 1, e: 2, [smile]: 3 }),
      `{"e":2,"${accent}":1,"${smile}":3}`,
    );
    assert.throws(() => canonicalJson(undefined));
  });

  const body = JSON.stringify({
    eventType: 'TxnAuthorisationApproved',
    objectType: 'TransactionEvent',
    eventId: TX,
    eventDateTime: '2026-10-17T10:00:00.000Z',
    recordId: TX,
    entityUid: ENTITY,
    source: 'pdsp',
    content: { id: TX, currency_code: 'USD', amount: '120.50', transaction_status: 'AUTHORISED' },
  });
  const verify = (headers: Record<string, string>, raw = body): Promise<boolean> =>
    adapter.verifyWebhook(ctx, { headers, rawBody: raw });

  await check('webhook: signatures of the three key types verify', async () => {
    for (const kind of ['ES256', 'RS256', 'PS256'] as const) {
      setup();
      const signer = makeSigner(kind, `kid-${kind}`);
      publishKeys(signer);
      assert.equal(await verify({ 'x-vfi-jws': sign(signer, body) }), true, kind);
    }
  });

  await check('webhook: the body is checked in canonical form', async () => {
    const signer = makeSigner('ES256', 'kid-1');
    publishKeys(signer);
    const reordered = JSON.stringify(
      Object.fromEntries(Object.entries(JSON.parse(body) as Json).reverse()),
      null,
      2,
    );
    assert.equal(await verify({ 'x-vfi-jws': sign(signer, body) }, reordered), true);
  });

  await check('webhook: every kind of tampering is refused', async () => {
    const signer = makeSigner('ES256', 'kid-1');
    const other = makeSigner('ES256', 'kid-1');
    publishKeys(signer);
    const good = sign(signer, body);
    assert.equal(await verify({ 'x-vfi-jws': good }), true);
    assert.equal(await verify({ 'x-vfi-jws': good }, body.replaceAll('120.50', '1.50')), false);
    assert.equal(await verify({}), false);
    assert.equal(await verify({ 'x-vfi-jws': good }, ''), false);
    assert.equal(await verify({ 'x-vfi-jws': good }, 'not json'), false);
    assert.equal(await verify({ 'x-vfi-jws': 'a.b' }), false);
    assert.equal(await verify({ 'x-vfi-jws': good.replaceAll('..', '.eyJ4IjoxfQ.') }), false);
    assert.equal(await verify({ 'x-vfi-jws': `${good}x` }), false);
    assert.equal(await verify({ 'x-vfi-jws': sign(other, body) }), false);
    assert.equal(await verify({ 'x-vfi-jws': sign(signer, body, {}, '{"a":1}') }), false);
    // signature over the wrong (non-canonical) text of the same body
    assert.equal(
      await verify({ 'x-vfi-jws': sign(signer, body, {}, body.replaceAll('{', '{ ')) }),
      false,
    );
  });

  await check('webhook: unsupported headers are refused', async () => {
    const signer = makeSigner('ES256', 'kid-1');
    publishKeys(signer);
    assert.equal(await verify({ 'x-vfi-jws': sign(signer, body, { alg: 'none' }) }), false);
    assert.equal(await verify({ 'x-vfi-jws': sign(signer, body, { alg: 'HS256' }) }), false);
    assert.equal(
      await verify({ 'x-vfi-jws': sign(signer, body, { crit: ['b64', 'exp'] }) }),
      false,
    );
    assert.equal(await verify({ 'x-vfi-jws': sign(signer, body, { crit: undefined }) }), false);
    assert.equal(await verify({ 'x-vfi-jws': sign(signer, body, { kid: undefined }) }), false);
    assert.equal(await verify({ 'x-vfi-jws': sign(signer, body, { alg: 'RS256' }) }), false);
    const rsa = makeSigner('RS256', 'kid-rsa');
    publishKeys(rsa);
    resetKeyCacheForVerification();
    assert.equal(await verify({ 'x-vfi-jws': sign({ ...rsa, alg: 'ES256' }, body) }), false);
  });

  await check(
    'webhook: key file is cached, an unknown key id is fetched at most once',
    async () => {
      const signer = makeSigner('ES256', 'kid-1');
      publishKeys(signer);
      for (let i = 0; i < 3; i += 1)
        assert.equal(await verify({ 'x-vfi-jws': sign(signer, body) }), true);
      assert.equal(callsTo('.jwks').length, 1);
      const stranger = makeSigner('ES256', 'kid-unknown');
      for (let i = 0; i < 3; i += 1)
        assert.equal(await verify({ 'x-vfi-jws': sign(stranger, body) }), false);
      assert.equal(callsTo('.jwks').length, 1);
      setup();
      assert.equal(await verify({ 'x-vfi-jws': sign(signer, body) }), false);
      route(`GET ${JWKS_PATH}`, { status: 500, body: {} });
      assert.equal(await verify({ 'x-vfi-jws': sign(signer, body) }), false);
      setup();
      route(`GET ${JWKS_PATH}`, { body: { keys: [] } });
      assert.equal(await verify({ 'x-vfi-jws': sign(signer, body) }), false);
    },
  );

  await check('webhook: live environment uses the production key file', async () => {
    const signer = makeSigner('ES256', 'kid-live');
    route('GET /prod-webhook-sign-keys/prod-webhook-sign-keys.jwks', {
      body: { keys: [signer.jwk] },
    });
    const live = {
      ...ctx,
      environment: 'live' as const,
      credentials: { ...ctx.credentials, region: 'emea' },
    };
    assert.equal(
      await adapter.verifyWebhook(live, {
        headers: { 'x-vfi-jws': sign(signer, body) },
        rawBody: body,
      }),
      true,
    );
    assert.equal(await verify({ 'x-vfi-jws': sign(signer, body) }), false);
    assert.equal(callsTo('prod-webhook-sign-keys.jwks').length, 1);
  });

  await check('webhook: event mapping', () => {
    const parse = (over: Json): ReturnType<typeof adapter.parseWebhook> =>
      adapter.parseWebhook({
        headers: {},
        rawBody: JSON.stringify({ ...(JSON.parse(body) as Json), ...over }),
      });
    const base = parse({});
    assert.deepEqual(
      [base.processorId, base.type, base.processorTransactionId, base.occurredAt],
      ['verifone', 'payment.authorized', TX, '2026-10-17T10:00:00.000Z'],
    );
    assert.deepEqual(base.payload, {
      verifoneEvent: 'TxnAuthorisationApproved',
      objectType: 'TransactionEvent',
      transactionStatus: 'AUTHORISED',
    });
    const table: [string, string][] = [
      ['TxnAuthorisationDeclined', 'payment.failed'],
      ['TxnSaleApproved', 'payment.captured'],
      ['TxnSaleDeclined', 'payment.failed'],
      ['TxnSaleConfirmed', 'payment.captured'],
      ['TxnCaptureApproved', 'payment.captured'],
      ['TxnCaptureDeclined', 'payment.failed'],
      ['TxnDelayedChargeApproved', 'payment.captured'],
      ['TxnVoidApproved', 'payment.voided'],
      ['TxnRefundApproved', 'payment.refunded'],
      ['TxnExtendApproved', 'unknown'],
      ['TxnRefundPreviewCancelled', 'unknown'],
      ['SomethingNew', 'unknown'],
    ];
    for (const [eventType, type] of table) assert.equal(parse({ eventType }).type, type, eventType);
    // the event id separates the steps of one payment and keeps a resend identical
    const ids = new Set([
      parse({}).eventId,
      parse({ eventType: 'TxnCaptureApproved' }).eventId,
      parse({ eventDateTime: '2026-10-17T10:00:01.000Z' }).eventId,
    ]);
    assert.equal(ids.size, 3);
    assert.equal(parse({}).eventId, base.eventId);
    assert.match(base.eventId, /^vf_[0-9a-f]{40}$/);
    // metadata only payload, checkout events, no id
    const meta = adapter.parseWebhook({
      headers: {},
      rawBody: JSON.stringify({
        eventType: 'TxnSaleApproved',
        eventId: TX,
        recordId: TX,
        eventDateTime: '2026-10-17T10:00:00Z',
      }),
    });
    assert.equal(meta.processorTransactionId, TX);
    const checkoutEvent = parse({
      eventType: 'CheckoutTransactionSucceeded',
      objectType: 'StandardEvents',
      content: undefined,
    });
    assert.deepEqual([checkoutEvent.type, checkoutEvent.processorTransactionId], ['unknown', null]);
    assert.throws(() => adapter.parseWebhook({ headers: {}, rawBody: 'x' }));
  });

  setTransportForVerification(null);
  process.stdout.write(`step11-verifone: ${checks} checks passed\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
