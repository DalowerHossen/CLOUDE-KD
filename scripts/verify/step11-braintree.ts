// path: scripts/verify/step11-braintree.ts
// Checks the Braintree adapter against a local fake transport that answers with the response shapes of Braintree's GraphQL
// reference and guides (docs/processors/braintree.md). It does NOT replace the sandbox run listed in
// docs/processors/braintree.verify.md. Run: npx tsx --conditions=react-server scripts/verify/step11-braintree.ts
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { adapter, braintreeValue } from '@/lib/payment/adapters/braintree';
import {
  avsPostal,
  cardIdentity,
  mapBraintreeDecline,
  readThreeDs,
} from '@/lib/payment/adapters/braintree/mapping';
import { braintreeChallengeResponse, graphqlId } from '@/lib/payment/adapters/braintree/webhook';
import { adapterProblems } from '@/lib/payment/capabilities';
import {
  setTransportForVerification,
  type HttpRequest,
  type HttpResponse,
} from '@/lib/payment/http-client';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, AuthorizeInput } from '@/types/contracts';

const PUBLIC = 'v4ndq314c2s5c28r';
const PRIVATE = '93b78bc88be90d93ac282e50ae569fdd';
const ctx: AdapterContext = {
  credentials: { publicKey: PUBLIC, privateKey: PRIVATE, merchantAccountId: 'kd_usd' },
  environment: 'sandbox',
  mode: 'hosted_fields',
  correlationId: 'c1',
};
const TX = 'dHJhbnNhY3Rpb25fazZqdHZ4NWM';
const input: AuthorizeInput = {
  idempotencyKey: 'pay_1:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'inv-uuid-1',
  companyId: 'co',
  paymentToken: 'fake-valid-visa-nonce',
  billing: { postalCode: '10001', country: 'US' },
  payerIp: '203.0.113.5',
  returnUrl: 'https://app.example.com/pay/x',
  threeDS: 'preferred',
  metadata: {},
};

type Json = Record<string, unknown>;
type Reply = { status?: number; body: unknown };
const seen: HttpRequest[] = [];
let routes = new Map<string, Reply | ((vars: Json) => Reply)>();
const route = (operation: string, reply: Reply | ((vars: Json) => Reply)): void =>
  void routes.set(operation, reply);
const operationOf = (query: string): string => /\{\s*(\w+)/.exec(query)?.[1] ?? '';
setTransportForVerification(async (request): Promise<HttpResponse> => {
  seen.push(request);
  const body = JSON.parse(request.body ?? '{}') as { query?: string; variables?: Json };
  const found = routes.get(operationOf(body.query ?? ''));
  if (!found) return { status: 404, text: '{}', headers: {} };
  const reply = typeof found === 'function' ? found(body.variables ?? {}) : found;
  return { status: reply.status ?? 200, text: JSON.stringify(reply.body), headers: {} };
});

const card = (over: Json = {}, auth?: Json): Json => ({
  brandCode: 'VISA',
  bin: '401288',
  last4: '1881',
  expirationMonth: '12',
  expirationYear: '2030',
  uniqueNumberIdentifier: null,
  threeDSecure: auth ? { authentication: auth } : null,
  ...over,
});
const goodAuth = {
  authenticationStatus: 'AUTHENTICATE_SUCCESSFUL',
  liabilityShifted: true,
  liabilityShiftPossible: true,
  cardEnrolled: 'YES',
  version: '2.2.0',
};
const response = (code: string, avs = 'MATCHES'): Json => ({
  legacyCode: code,
  message: 'text',
  avsPostalCodeResponse: avs,
  cvvResponse: 'MATCHES',
});
const tx = (
  status: string,
  history: Json[],
  over: Json = {},
  cardOver: Json = {},
  auth?: Json,
): Json => ({
  id: TX,
  status,
  amount: { value: '120.50', currencyCode: 'USD' },
  paymentMethodSnapshot: { creditCard: card(cardOver, auth) },
  statusHistory: history,
  ...over,
});
const authorized = (auth: Json | undefined = goodAuth, avs = 'MATCHES'): Json =>
  tx(
    'AUTHORIZED',
    [{ status: 'AUTHORIZED', processorResponse: response('1000', avs) }],
    {},
    {},
    auth,
  );
const declined = (code: string): Json =>
  tx('PROCESSOR_DECLINED', [
    { status: 'PROCESSOR_DECLINED', declineType: 'SOFT', processorResponse: response(code) },
  ]);
const rejected = (reason: string): Json =>
  tx('GATEWAY_REJECTED', [
    {
      status: 'GATEWAY_REJECTED',
      gatewayRejectionReason: reason,
      processorResponse: response('1000'),
    },
  ]);
const ok = (mutation: string, transaction: Json): Reply => ({
  body: { data: { [mutation]: { transaction } } },
});
const failure = (errorClass: string, legacyCode: string | null = null): Reply => ({
  body: {
    data: null,
    errors: [{ message: 'm', extensions: { errorClass, legacyCode } }],
  },
});

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
const lastBody = (): { query: string; variables: { input: Json } } =>
  JSON.parse(seen[seen.length - 1]?.body ?? '{}') as { query: string; variables: { input: Json } };

function delivery(kind: string, subject: string, privateKey = PRIVATE, publicKey = PUBLIC): string {
  const xml = `<notification><timestamp type="datetime">2026-10-17T10:00:00Z</timestamp><kind>${kind}</kind><subject>${subject}</subject></notification>`;
  const payload = `${Buffer.from(xml, 'utf8').toString('base64')}\n`;
  const key = createHash('sha1').update(privateKey).digest();
  const signature = createHmac('sha1', key).update(payload).digest('hex');
  return new URLSearchParams({
    bt_signature: `${publicKey}|${signature}`,
    bt_payload: payload,
  }).toString();
}
const DISPUTE = '<dispute><id>dsp1</id><transaction><id>k6jtvx5c</id></transaction></dispute>';

async function main(): Promise<void> {
  await check('contract is complete', () => {
    assert.deepEqual(adapterProblems(adapter), []);
    assert.deepEqual(
      adapter.credentialFields.map((f) => [f.key, f.secret, f.required]),
      [
        ['publicKey', false, true],
        ['privateKey', true, true],
        ['merchantAccountId', false, false],
      ],
    );
  });

  await check('value formatting', () => {
    assert.equal(braintreeValue(Money.parse('120.5')), '120.50');
    assert.equal(braintreeValue(Money.parse('0.07')), '0.07');
    assert.equal(braintreeValue(Money.parse('1000')), '1000.00');
  });

  await check(
    'checkout session: client token with documented headers and no secret in the client data',
    async () => {
      route('createClientToken', (vars) => {
        assert.deepEqual(vars, { input: { clientToken: { merchantAccountId: 'kd_usd' } } });
        return { body: { data: { createClientToken: { clientToken: 'eyJ2ZXJzaW9uIjoyfQ==' } } } };
      });
      const session = await adapter.createCheckoutSession(ctx, {
        idempotencyKey: 'link:session:1',
        amount: Money.parse('120.50'),
        invoiceId: 'inv',
        companyId: 'co',
        returnUrl: 'https://app.example.com/pay/x',
        threeDS: 'required',
      });
      const request = seen[0];
      assert.equal(request?.url, 'https://payments.sandbox.braintree-api.com/graphql');
      assert.equal(
        request?.headers.authorization,
        `Basic ${Buffer.from(`${PUBLIC}:${PRIVATE}`).toString('base64')}`,
      );
      assert.match(request?.headers['braintree-version'] ?? '', /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(request?.headers['content-type'], 'application/json');
      assert.equal(session.clientConfig.clientToken, 'eyJ2ZXJzaW9uIjoyfQ==');
      assert.equal(session.clientConfig.amount, '120.50');
      assert.equal(session.clientConfig.threeDS, 'required');
      assert.ok(!JSON.stringify(session).includes(PRIVATE));
      assert.ok(session.expiresAt !== null);
    },
  );

  await check('live host and no merchant account id', async () => {
    route('createClientToken', (vars) => {
      assert.deepEqual(vars, { input: { clientToken: {} } });
      return { body: { data: { createClientToken: { clientToken: 'tok' } } } };
    });
    await adapter.createCheckoutSession(
      { ...ctx, environment: 'live', credentials: { publicKey: PUBLIC, privateKey: PRIVATE } },
      {
        idempotencyKey: 'k',
        amount: Money.parse('1'),
        invoiceId: 'i',
        companyId: 'c',
        returnUrl: 'https://app.example.com/x',
        threeDS: 'disabled',
      },
    );
    assert.equal(seen[0]?.url, 'https://payments.braintree-api.com/graphql');
  });

  await check('authorize: request fields as documented, result mapped', async () => {
    route('authorizePaymentMethod', ok('authorizePaymentMethod', authorized()));
    const result = await adapter.authorize(ctx, input);
    const sent = lastBody().variables.input;
    assert.equal(sent.apiRequestKey, 'pay_1:authorize');
    assert.equal(sent.paymentMethodId, 'fake-valid-visa-nonce');
    assert.deepEqual(sent.transaction, {
      amount: '120.50',
      orderId: 'inv-uuid-1',
      merchantAccountId: 'kd_usd',
      riskData: { customerIp: '203.0.113.5' },
    });
    assert.equal(result.status, 'authorized');
    assert.equal(result.processorTransactionId, TX);
    assert.ok(result.amount.eq('120.50'));
    assert.equal(result.avsPostalCodeMatch, true);
    assert.deepEqual(result.cardIdentity, {
      type: 'fingerprint',
      value: '401288|1881|12/2030|VISA',
    });
    assert.deepEqual(result.threeDS, {
      requested: true,
      completed: true,
      authenticated: true,
      liabilityShift: true,
    });
  });

  await check(
    'authorize: AVS mismatch and unknown, 3DS off, identity from the unique number',
    async () => {
      route(
        'authorizePaymentMethod',
        ok('authorizePaymentMethod', authorized(undefined, 'DOES_NOT_MATCH')),
      );
      const mismatch = await adapter.authorize(ctx, {
        ...input,
        threeDS: 'disabled',
        payerIp: 'not an ip',
      });
      assert.equal(mismatch.avsPostalCodeMatch, false);
      assert.equal(mismatch.threeDS.requested, false);
      assert.equal((lastBody().variables.input.transaction as Json).riskData, undefined);
      route(
        'authorizePaymentMethod',
        ok('authorizePaymentMethod', {
          ...authorized(undefined, 'NOT_VERIFIED'),
          paymentMethodSnapshot: { creditCard: card({ uniqueNumberIdentifier: 'abc123' }) },
        }),
      );
      const unknown = await adapter.authorize(ctx, input);
      assert.equal(unknown.avsPostalCodeMatch, null);
      assert.deepEqual(unknown.cardIdentity, { type: 'fingerprint', value: 'uid:abc123' });
    },
  );

  await check('declines by processor response code', async () => {
    const expected: [string, string][] = [
      ['2001', 'insufficient_funds'],
      ['2004', 'invalid_expiry'],
      ['2005', 'invalid_number'],
      ['2010', 'invalid_cvv'],
      ['2099', 'three_ds_failed'],
      ['2014', 'processor_fraud_signal'],
      ['2046', 'do_not_honor'],
      ['2500', 'do_not_honor'],
      ['2025', 'processor_error'],
      ['3000', 'processor_error'],
      ['2107', 'other'],
    ];
    for (const [code, category] of expected) {
      route('authorizePaymentMethod', ok('authorizePaymentMethod', declined(code)));
      const result = await adapter.authorize(ctx, input);
      assert.equal(result.status, 'declined', code);
      assert.equal(result.declineCategory, category, code);
      assert.equal(result.rawCode, code);
      assert.equal(adapter.mapDecline({ code, message: null }), category);
    }
  });

  await check('gateway rejections by reason, failed and other statuses', async () => {
    const expected: [string, string][] = [
      ['CVV', 'invalid_cvv'],
      ['AVS_AND_CVV', 'invalid_cvv'],
      ['THREE_D_SECURE', 'three_ds_failed'],
      ['FRAUD', 'processor_fraud_signal'],
      ['RISK_THRESHOLD', 'processor_fraud_signal'],
      ['APPLICATION_INCOMPLETE', 'processor_error'],
      ['DUPLICATE', 'other'],
      ['AVS', 'other'],
    ];
    for (const [reason, category] of expected) {
      route('authorizePaymentMethod', ok('authorizePaymentMethod', rejected(reason)));
      const result = await adapter.authorize(ctx, input);
      assert.equal(result.status, 'declined', reason);
      assert.equal(result.declineCategory, category, reason);
      assert.equal(result.rawCode, reason);
    }
    route(
      'authorizePaymentMethod',
      ok(
        'authorizePaymentMethod',
        tx('FAILED', [{ status: 'FAILED', processorResponse: response('3000') }]),
      ),
    );
    const failed = await adapter.authorize(ctx, input);
    assert.equal(failed.status, 'error');
    assert.equal(failed.declineCategory, 'processor_error');
  });

  await check(
    'requests the service refused are payment failures; outages and bad keys are not',
    async () => {
      route('authorizePaymentMethod', failure('VALIDATION', '91565'));
      const refused = await adapter.authorize(ctx, input);
      assert.equal(refused.status, 'declined');
      assert.equal(refused.rawCode, '91565');
      route('authorizePaymentMethod', failure('INTERNAL'));
      await assert.rejects(adapter.authorize(ctx, input), /temporarily unavailable/);
      route('authorizePaymentMethod', failure('SERVICE_AVAILABILITY'));
      await assert.rejects(adapter.authorize(ctx, input), /temporarily unavailable/);
      route('authorizePaymentMethod', failure('AUTHENTICATION'));
      await assert.rejects(adapter.authorize(ctx, input), ValidationError);
      route('authorizePaymentMethod', { status: 401, body: {} });
      await assert.rejects(adapter.authorize(ctx, input), ValidationError);
      route('authorizePaymentMethod', { status: 503, body: {} });
      await assert.rejects(adapter.authorize(ctx, input), /unavailable/);
      await assert.rejects(
        adapter.authorize({ ...ctx, credentials: { publicKey: PUBLIC } }, input),
        ValidationError,
      );
      await assert.rejects(
        adapter.authorize(ctx, { ...input, paymentToken: 'x; drop table' }),
        ValidationError,
      );
    },
  );

  await check('3D Secure reading from the server-side snapshot', () => {
    const read = (status: string | null, shifted: boolean | null): ReturnType<typeof readThreeDs> =>
      readThreeDs(
        {
          threeDSecure: {
            authentication: { authenticationStatus: status, liabilityShifted: shifted },
          },
        },
        true,
      );
    assert.deepEqual(read('AUTHENTICATE_SUCCESSFUL', true), {
      requested: true,
      completed: true,
      authenticated: true,
      liabilityShift: true,
    });
    assert.deepEqual(read('AUTHENTICATE_ATTEMPT_SUCCESSFUL', true), {
      requested: true,
      completed: true,
      authenticated: false,
      liabilityShift: true,
    });
    assert.equal(read('AUTHENTICATE_FAILED', false).authenticated, false);
    assert.equal(read('LOOKUP_NOT_ENROLLED', false).completed, true);
    assert.equal(read('CHALLENGE_REQUIRED', null).completed, false);
    assert.deepEqual(read(null, null), {
      requested: true,
      completed: false,
      authenticated: false,
      liabilityShift: null,
    });
    assert.deepEqual(readThreeDs(null, false), {
      requested: false,
      completed: false,
      authenticated: false,
      liabilityShift: null,
    });
    assert.equal(cardIdentity(null), null);
    assert.equal(cardIdentity({ brandCode: 'VISA' }), null);
    assert.equal(avsPostal('MATCHES'), true);
    assert.equal(avsPostal('DOES_NOT_MATCH'), false);
    assert.equal(avsPostal('NOT_PROVIDED'), null);
    assert.equal(mapBraintreeDecline({ code: null, message: null }), 'other');
  });

  await check('capture, including a repeated capture the service refuses', async () => {
    route(
      'captureTransaction',
      ok('captureTransaction', tx('SUBMITTED_FOR_SETTLEMENT', [], { amount: { value: '100.00' } })),
    );
    const captured = await adapter.capture?.(ctx, {
      idempotencyKey: 'pay_1:capture',
      processorTransactionId: TX,
      amount: Money.parse('100'),
    });
    const sent = lastBody().variables.input;
    assert.deepEqual(sent, {
      apiRequestKey: 'pay_1:capture',
      transactionId: TX,
      transaction: { amount: '100.00' },
    });
    assert.equal(captured?.status, 'captured');
    assert.ok(captured?.amount.eq('100'));
    route('captureTransaction', failure('VALIDATION', '91507'));
    route('node', { body: { data: { node: tx('SETTLED', []) } } });
    assert.equal(
      (
        await adapter.capture?.(ctx, {
          idempotencyKey: 'k',
          processorTransactionId: TX,
          amount: Money.parse('120.50'),
        })
      )?.status,
      'captured',
    );
    route('node', { body: { data: { node: authorized() } } });
    const refused = await adapter.capture?.(ctx, {
      idempotencyKey: 'k',
      processorTransactionId: TX,
      amount: Money.parse('999'),
    });
    assert.equal(refused?.status, 'declined');
    await assert.rejects(
      adapter.capture?.(ctx, {
        idempotencyKey: 'k',
        processorTransactionId: '../x',
        amount: Money.parse('1'),
      }) ?? Promise.resolve(),
      ValidationError,
    );
  });

  await check('void, including an authorization that is already voided', async () => {
    route('voidTransaction', ok('voidTransaction', tx('VOIDED', [])));
    const voided = await adapter.voidAuthorization?.(ctx, {
      idempotencyKey: 'pay_1:void',
      processorTransactionId: TX,
    });
    assert.deepEqual(lastBody().variables.input, {
      apiRequestKey: 'pay_1:void',
      transactionId: TX,
    });
    assert.equal(voided?.status, 'voided');
    route('voidTransaction', failure('VALIDATION', '91504'));
    route('node', { body: { data: { node: tx('VOIDED', []) } } });
    assert.equal(
      (await adapter.voidAuthorization?.(ctx, { idempotencyKey: 'k', processorTransactionId: TX }))
        ?.status,
      'voided',
    );
    route('node', { body: { data: { node: tx('SETTLED', []) } } });
    assert.equal(
      (await adapter.voidAuthorization?.(ctx, { idempotencyKey: 'k', processorTransactionId: TX }))
        ?.status,
      'declined',
    );
  });

  await check(
    'refund: settled -> refund; not yet settling -> void or a clear refusal',
    async () => {
      route('node', { body: { data: { node: tx('SETTLED', []) } } });
      route('refundTransaction', {
        body: {
          data: {
            refundTransaction: {
              refund: {
                id: 'REF1',
                status: 'SUBMITTED_FOR_SETTLEMENT',
                amount: { value: '25.00' },
              },
            },
          },
        },
      });
      const partial = await adapter.refund(ctx, {
        idempotencyKey: 'ref_1:refund',
        processorTransactionId: TX,
        amount: Money.parse('25'),
        reason: null,
      });
      assert.deepEqual(lastBody().variables.input, {
        apiRequestKey: 'ref_1:refund',
        transactionId: TX,
        refund: { amount: '25.00' },
      });
      assert.deepEqual([partial.status, partial.processorTransactionId], ['refunded', 'REF1']);
      route('refundTransaction', failure('VALIDATION', '91512'));
      const refused = await adapter.refund(ctx, {
        idempotencyKey: 'k',
        processorTransactionId: TX,
        amount: Money.parse('25'),
        reason: null,
      });
      assert.deepEqual([refused.status, refused.rawCode], ['declined', '91512']);
      // Submitted for settlement: a full refund becomes a void, a partial one is refused with a clear reason.
      route('node', { body: { data: { node: tx('SUBMITTED_FOR_SETTLEMENT', []) } } });
      route('voidTransaction', ok('voidTransaction', tx('VOIDED', [])));
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
      route('node', { body: { data: { node: authorized() } } });
      const notYet = await adapter.refund(ctx, {
        idempotencyKey: 'k',
        processorTransactionId: TX,
        amount: Money.parse('20'),
        reason: null,
      });
      assert.deepEqual([notYet.status, notYet.rawCode], ['declined', 'AUTHORIZED']);
      route('node', { body: { data: { node: null } } });
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
    route('node', {
      body: {
        data: {
          node: tx('SETTLED', [{ status: 'AUTHORIZED', processorResponse: response('1000') }]),
        },
      },
    });
    const found = await adapter.getTransaction(ctx, TX);
    assert.equal(found.status, 'captured');
    assert.equal(found.processorTransactionId, TX);
    route('node', { body: { data: { node: {} } } });
    await assert.rejects(adapter.getTransaction(ctx, TX), ValidationError);
    const statuses: [string, string][] = [
      ['AUTHORIZED', 'authorized'],
      ['SUBMITTED_FOR_SETTLEMENT', 'captured'],
      ['SETTLING', 'captured'],
      ['SETTLEMENT_PENDING', 'pending'],
      ['VOIDED', 'voided'],
      ['AUTHORIZATION_EXPIRED', 'voided'],
      ['SETTLEMENT_DECLINED', 'declined'],
      ['SOMETHING_NEW', 'error'],
    ];
    for (const [status, mapped] of statuses) {
      route('node', { body: { data: { node: tx(status, []) } } });
      assert.equal((await adapter.getTransaction(ctx, TX)).status, mapped, status);
    }
  });

  await check('connection test', async () => {
    route('ping', { body: { data: { ping: 'pong' } } });
    route('createClientToken', { body: { data: { createClientToken: { clientToken: 't' } } } });
    const good = await adapter.testConnection(ctx);
    assert.equal(good.ok, true);
    route('createClientToken', failure('VALIDATION', '92000'));
    assert.equal((await adapter.testConnection(ctx)).ok, false);
    route('createClientToken', failure('AUTHENTICATION'));
    const bad = await adapter.testConnection(ctx);
    assert.equal(bad.ok, false);
    assert.ok(!bad.message.includes(PRIVATE));
    route('ping', { status: 503, body: {} });
    assert.equal((await adapter.testConnection(ctx)).ok, false);
  });

  await check('webhook verification (HMAC-SHA1 with SHA1 of the private key)', async () => {
    const body = delivery('dispute_opened', DISPUTE);
    assert.equal(await adapter.verifyWebhook(ctx, { headers: {}, rawBody: body }), true);
    // Signed over the payload with a trailing newline while the post carries it without (the SDK accepts both).
    const form = new URLSearchParams(body);
    const payload = (form.get('bt_payload') ?? '').trim();
    const key = createHash('sha1').update(PRIVATE).digest();
    const bare = createHmac('sha1', key).update(`${payload}\n`).digest('hex');
    const bareBody = new URLSearchParams({
      bt_signature: `${PUBLIC}|${bare}`,
      bt_payload: payload,
    }).toString();
    assert.equal(await adapter.verifyWebhook(ctx, { headers: {}, rawBody: bareBody }), true);
    // Several key pairs: ours is picked.
    const other = new URLSearchParams({
      bt_signature: `zzzzzzzzzzzzzzzz|deadbeef&${form.get('bt_signature')}`,
      bt_payload: form.get('bt_payload') ?? '',
    }).toString();
    assert.equal(await adapter.verifyWebhook(ctx, { headers: {}, rawBody: other }), true);
    const refuse = async (raw: string): Promise<void> =>
      assert.equal(await adapter.verifyWebhook(ctx, { headers: {}, rawBody: raw }), false);
    await refuse(delivery('dispute_opened', DISPUTE, 'f'.repeat(32)));
    await refuse(delivery('dispute_opened', DISPUTE, PRIVATE, 'aaaaaaaaaaaaaaaa'));
    const tampered = new URLSearchParams(body);
    tampered.set(
      'bt_payload',
      `${Buffer.from('<notification><kind>x</kind></notification>').toString('base64')}\n`,
    );
    await refuse(tampered.toString());
    const illegal = new URLSearchParams(body);
    illegal.set('bt_payload', '<script>alert(1)</script>');
    await refuse(illegal.toString());
    await refuse('');
    await refuse('bt_signature=a%7Cb');
    await refuse('bt_payload=QUJD');
    assert.equal(
      await adapter.verifyWebhook({ ...ctx, credentials: {} }, { headers: {}, rawBody: body }),
      false,
    );
    assert.equal(seen.length, 0);
  });

  await check('webhook events', () => {
    const parse = (kind: string, subject: string): ReturnType<typeof adapter.parseWebhook> =>
      adapter.parseWebhook({ headers: {}, rawBody: delivery(kind, subject) });
    const expected: [string, string][] = [
      ['dispute_opened', 'dispute.opened'],
      ['dispute_under_review', 'dispute.updated'],
      ['dispute_disputed', 'dispute.updated'],
      ['dispute_won', 'dispute.closed'],
      ['dispute_lost', 'dispute.closed'],
      ['dispute_accepted', 'dispute.closed'],
      ['dispute_auto_accepted', 'dispute.closed'],
      ['dispute_expired', 'dispute.closed'],
    ];
    for (const [kind, type] of expected) {
      const event = parse(kind, DISPUTE);
      assert.equal(event.type, type, kind);
      assert.equal(event.processorTransactionId, TX, kind);
      assert.equal(event.payload.disputeId, 'dsp1');
      assert.equal(event.occurredAt, '2026-10-17T10:00:00.000Z');
      assert.equal(event.processorId, 'braintree');
    }
    const a = parse('dispute_opened', DISPUTE);
    const b = parse('dispute_opened', DISPUTE);
    assert.equal(a.eventId, b.eventId);
    assert.match(a.eventId, /^bt_[0-9a-f]{64}$/);
    assert.notEqual(a.eventId, parse('dispute_won', DISPUTE).eventId);
    const settled = parse('transaction_settled', '<transaction><id>k6jtvx5c</id></transaction>');
    assert.deepEqual([settled.type, settled.processorTransactionId], ['payment.captured', TX]);
    assert.equal(
      parse('transaction_settlement_declined', '<transaction><id>k6jtvx5c</id></transaction>').type,
      'payment.failed',
    );
    assert.equal(parse('check', '').type, 'unknown');
    assert.equal(parse('check', '').processorTransactionId, null);
    assert.equal(
      parse('dispute_opened', '<dispute><transaction><id>../x</id></transaction></dispute>')
        .processorTransactionId,
      null,
    );
    assert.throws(() => adapter.parseWebhook({ headers: {}, rawBody: 'x' }));
    assert.equal(graphqlId('transaction', 'k6jtvx5c'), TX);
    assert.equal(graphqlId('transaction', 'a b'), null);
  });

  await check('destination check challenge', () => {
    const challenge = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const key = createHash('sha1').update(PRIVATE).digest();
    const digest = createHmac('sha1', key).update(challenge).digest('hex');
    assert.equal(braintreeChallengeResponse(ctx, challenge), `${PUBLIC}|${digest}`);
    assert.equal(braintreeChallengeResponse(ctx, 'NOT-HEX'), null);
    assert.equal(braintreeChallengeResponse({ ...ctx, credentials: {} }, challenge), null);
  });

  setTransportForVerification(null);
  process.stdout.write(`step11-braintree: ${checks} checks passed\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
