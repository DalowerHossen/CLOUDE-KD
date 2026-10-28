// path: scripts/verify/step11-stripe.ts
// Checks the Stripe adapter against a local fake transport that answers with response shapes taken from the Stripe
// documentation (docs/processors/stripe.md). It proves request building, response mapping, signatures and refusals. It does
// NOT replace the sandbox run (docs/processors/stripe.verify.md lists what still needs sandbox keys).
// Run: npx tsx --conditions=react-server scripts/verify/step11-stripe.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { adapter, mapStripeDecline, STRIPE_API_VERSION } from '@/lib/payment/adapters/stripe';
import { encodeForm } from '@/lib/payment/adapters/stripe/form';
import {
  verifyStripeSignature,
  type parseStripeEvent,
} from '@/lib/payment/adapters/stripe/webhook';
import { fromMinorUnits, toMinorUnits } from '@/lib/payment/adapters/base';
import { adapterProblems } from '@/lib/payment/capabilities';
import { setTransportForVerification, type HttpRequest } from '@/lib/payment/http-client';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext, AuthorizeInput } from '@/types/contracts';

const ctx: AdapterContext = {
  credentials: {
    secretKey: 'sk_test_ABCDEFGHIJKLMNOP1234',
    publishableKey: 'pk_test_ABCDEFGHIJKLMNOP1234',
    webhookSecret: 'whsec_ABCDEFGHIJKLMNOP1234',
  },
  environment: 'sandbox',
  mode: 'default',
  correlationId: 'c1',
};
const input: AuthorizeInput = {
  idempotencyKey: 'pay_1:authorize',
  amount: Money.parse('120.50'),
  invoiceId: 'inv',
  companyId: 'co',
  paymentToken: 'ctoken_1TEST',
  billing: { postalCode: '10001', country: 'US' },
  payerIp: '203.0.113.5',
  returnUrl: 'https://app.example.com/pay/x',
  threeDS: 'preferred',
  metadata: { paymentId: 'pay_1' },
};

const seen: HttpRequest[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: {} };
setTransportForVerification(async (request) => {
  seen.push(request);
  return { status: reply.status, text: JSON.stringify(reply.body), headers: {} };
});

const charge = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'ch_1',
  payment_method_details: {
    card: {
      fingerprint: 'FPRINT123',
      checks: { address_postal_code_check: 'pass' },
      three_d_secure: null,
    },
    type: 'card',
  },
  ...over,
});
const intent = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'pi_3TESTINTENT01',
  object: 'payment_intent',
  amount: 12050,
  amount_capturable: 12050,
  status: 'requires_capture',
  client_secret: 'pi_3TESTINTENT01_secret_x',
  latest_charge: charge(),
  last_payment_error: null,
  next_action: null,
  ...over,
});

let checks = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  seen.length = 0;
  try {
    await fn();
    checks += 1;
  } catch (e) {
    process.stderr.write(`FAIL ${name}\n`);
    throw e;
  }
}

async function main(): Promise<void> {
  await check('contract is complete', () => {
    assert.deepEqual(adapterProblems(adapter), []);
    assert.equal(adapter.id, 'stripe');
    assert.deepEqual(
      adapter.credentialFields.map((f) => [f.key, f.secret]),
      [
        ['secretKey', true],
        ['publishableKey', false],
        ['webhookSecret', true],
        ['connectWebhookSecret', true],
        ['connectedAccountId', false],
      ],
    );
    for (const f of adapter.credentialFields) assert.ok(f.pattern);
  });

  await check('minor units and form encoding', () => {
    assert.equal(toMinorUnits(Money.parse('120.50')), '12050');
    assert.equal(toMinorUnits(Money.parse('0.005')), '1');
    assert.equal(toMinorUnits(Money.parse('0.0049')), '0');
    assert.equal(fromMinorUnits(12050).toDbString(), '120.5000');
    assert.equal(fromMinorUnits('5').toDbString(), '0.0500');
    assert.equal(
      encodeForm({ a: 1, b: { c: 'x y', d: [1, 2] }, e: null, f: true }),
      'a=1&b[c]=x%20y&b[d][0]=1&b[d][1]=2&f=true',
    );
  });

  await check('authorize: request is built as documented', async () => {
    reply = { status: 200, body: intent() };
    const tx = await adapter.authorize(ctx, input);
    const req = seen[0];
    assert.ok(req);
    assert.equal(req.method, 'POST');
    assert.equal(req.url, 'https://api.stripe.com/v1/payment_intents');
    assert.equal(req.headers['idempotency-key'], 'pay_1:authorize');
    assert.equal(req.headers['stripe-version'], STRIPE_API_VERSION);
    assert.equal(
      req.headers.authorization,
      `Basic ${Buffer.from('sk_test_ABCDEFGHIJKLMNOP1234:').toString('base64')}`,
    );
    assert.equal(req.headers['content-type'], 'application/x-www-form-urlencoded');
    const body = new URLSearchParams(req.body);
    assert.equal(body.get('amount'), '12050');
    assert.equal(body.get('currency'), 'usd');
    assert.equal(body.get('capture_method'), 'manual');
    assert.equal(body.get('confirm'), 'true');
    assert.equal(body.get('confirmation_token'), 'ctoken_1TEST');
    assert.equal(body.get('return_url'), 'https://app.example.com/pay/x');
    assert.equal(body.get('payment_method_options[card][request_three_d_secure]'), 'any');
    assert.equal(body.get('metadata[paymentId]'), 'pay_1');
    assert.equal(body.get('expand[0]'), 'latest_charge');
    assert.equal(tx.status, 'authorized');
    assert.equal(tx.processorTransactionId, 'pi_3TESTINTENT01');
    assert.equal(tx.amount.toDbString(), '120.5000');
    assert.deepEqual(tx.cardIdentity, { type: 'fingerprint', value: 'FPRINT123' });
    assert.equal(tx.avsPostalCodeMatch, true);
    assert.equal(tx.threeDS.requested, true);
    assert.equal(tx.threeDS.authenticated, false);
  });

  await check('3DS policy mapping', async () => {
    reply = { status: 200, body: intent() };
    await adapter.authorize(ctx, { ...input, threeDS: 'required' });
    await adapter.authorize(ctx, { ...input, threeDS: 'disabled' });
    assert.equal(
      new URLSearchParams(seen[0]?.body).get(
        'payment_method_options[card][request_three_d_secure]',
      ),
      'challenge',
    );
    assert.equal(
      new URLSearchParams(seen[1]?.body).get(
        'payment_method_options[card][request_three_d_secure]',
      ),
      'automatic',
    );
  });

  await check('authenticated 3DS and statuses', async () => {
    reply = {
      status: 200,
      body: intent({
        status: 'succeeded',
        latest_charge: charge({
          payment_method_details: {
            card: {
              fingerprint: 'F',
              checks: {},
              three_d_secure: { result: 'authenticated', authentication_flow: 'challenge' },
            },
          },
        }),
      }),
    };
    const tx = await adapter.authorize(ctx, input);
    assert.equal(tx.status, 'captured');
    assert.deepEqual([tx.threeDS.completed, tx.threeDS.authenticated], [true, true]);
    assert.equal(tx.avsPostalCodeMatch, null);
    reply = {
      status: 200,
      body: intent({
        status: 'requires_capture',
        latest_charge: charge({
          payment_method_details: {
            card: {
              fingerprint: 'F',
              checks: {},
              three_d_secure: { result: 'attempt_acknowledged' },
            },
          },
        }),
      }),
    };
    const attempted = await adapter.authorize(ctx, input);
    assert.deepEqual(
      [attempted.threeDS.completed, attempted.threeDS.authenticated],
      [true, false],
      'only "authenticated" counts',
    );
    reply = { status: 200, body: intent({ status: 'processing' }) };
    assert.equal((await adapter.authorize(ctx, input)).status, 'pending');
    reply = { status: 200, body: intent({ status: 'canceled' }) };
    assert.equal((await adapter.authorize(ctx, input)).status, 'voided');
  });

  await check('requires_action: redirect and SDK challenge', async () => {
    reply = {
      status: 200,
      body: intent({
        status: 'requires_action',
        latest_charge: null,
        next_action: {
          type: 'redirect_to_url',
          redirect_to_url: {
            url: 'https://hooks.stripe.com/3d_secure_2/x',
            return_url: 'https://app.example.com/pay/x',
          },
        },
      }),
    };
    const redirect = await adapter.authorize(ctx, input);
    assert.equal(redirect.status, 'requires_action');
    assert.deepEqual(redirect.requiredAction, {
      kind: 'redirect',
      url: 'https://hooks.stripe.com/3d_secure_2/x',
      clientSecret: null,
    });
    reply = {
      status: 200,
      body: intent({
        status: 'requires_action',
        latest_charge: null,
        next_action: { type: 'use_stripe_sdk', use_stripe_sdk: {} },
      }),
    };
    const sdk = await adapter.authorize(ctx, input);
    assert.deepEqual(sdk.requiredAction, {
      kind: 'sdk_challenge',
      url: null,
      clientSecret: 'pi_3TESTINTENT01_secret_x',
    });
    assert.equal(sdk.threeDS.requested, true);
    assert.equal(sdk.threeDS.completed, false);
  });

  await check('declines: card_error body, categories and identity from the error', async () => {
    const cases: [string, string][] = [
      ['insufficient_funds', 'insufficient_funds'],
      ['incorrect_cvc', 'invalid_cvv'],
      ['expired_card', 'invalid_expiry'],
      ['incorrect_number', 'invalid_number'],
      ['generic_decline', 'do_not_honor'],
      ['fraudulent', 'processor_fraud_signal'],
      ['processing_error', 'processor_error'],
      ['authentication_required', 'three_ds_failed'],
    ];
    for (const [code, category] of cases) {
      reply = {
        status: 402,
        body: {
          error: {
            type: 'card_error',
            code: 'card_declined',
            decline_code: code,
            message: 'Your card was declined.',
            payment_method: { card: { fingerprint: 'FDECL' } },
            payment_intent: intent({
              status: 'requires_payment_method',
              amount_capturable: 0,
              latest_charge: null,
              last_payment_error: {
                code: 'card_declined',
                decline_code: code,
                message: 'declined',
                payment_method: { card: { fingerprint: 'FDECL' } },
              },
            }),
          },
        },
      };
      const tx = await adapter.authorize(ctx, input);
      assert.equal(tx.status, 'declined', code);
      assert.equal(tx.declineCategory, category, code);
      assert.deepEqual(tx.cardIdentity, { type: 'fingerprint', value: 'FDECL' });
    }
    reply = {
      status: 402,
      body: { error: { type: 'card_error', code: 'expired_card', message: 'x' } },
    };
    assert.equal(
      (await adapter.authorize(ctx, input)).declineCategory,
      'invalid_expiry',
      'code without decline_code',
    );
    reply = {
      status: 200,
      body: intent({
        status: 'requires_payment_method',
        latest_charge: null,
        last_payment_error: null,
      }),
    };
    assert.equal(
      (await adapter.getTransaction(ctx, 'pi_3TESTINTENT01')).declineCategory,
      'three_ds_failed',
      'authentication failure returns the intent to requires_payment_method',
    );
  });

  await check('mapDecline covers the documented codes', () => {
    assert.equal(
      mapStripeDecline({ code: 'payment_intent_authentication_failure', message: null }),
      'three_ds_failed',
    );
    assert.equal(mapStripeDecline({ code: 'lost_card', message: null }), 'processor_fraud_signal');
    assert.equal(mapStripeDecline({ code: 'unknown_thing', message: null }), 'other');
    assert.equal(mapStripeDecline({ code: null, message: null }), 'other');
  });

  await check('capture, void, refund, status', async () => {
    reply = { status: 200, body: intent({ status: 'succeeded' }) };
    const cap = await adapter.capture?.(ctx, {
      idempotencyKey: 'pay_1:capture',
      processorTransactionId: 'pi_3TESTINTENT01',
      amount: Money.parse('120.50'),
    });
    assert.equal(cap?.status, 'captured');
    assert.equal(
      seen[0]?.url,
      'https://api.stripe.com/v1/payment_intents/pi_3TESTINTENT01/capture',
    );
    assert.equal(new URLSearchParams(seen[0]?.body).get('amount_to_capture'), '12050');
    assert.equal(seen[0]?.headers['idempotency-key'], 'pay_1:capture');
    reply = { status: 200, body: intent({ status: 'canceled', amount_capturable: 0 }) };
    const voided = await adapter.voidAuthorization?.(ctx, {
      idempotencyKey: 'pay_1:void',
      processorTransactionId: 'pi_3TESTINTENT01',
    });
    assert.equal(voided?.status, 'voided');
    assert.equal(seen[1]?.url, 'https://api.stripe.com/v1/payment_intents/pi_3TESTINTENT01/cancel');
    reply = {
      status: 200,
      body: { id: 're_1TEST', object: 'refund', status: 'succeeded', amount: 2500 },
    };
    const refund = await adapter.refund(ctx, {
      idempotencyKey: 'rf_1:refund',
      processorTransactionId: 'pi_3TESTINTENT01',
      amount: Money.parse('25'),
      reason: 'duplicate order',
    });
    assert.equal(refund.status, 'refunded');
    assert.equal(refund.processorTransactionId, 're_1TEST');
    const rb = new URLSearchParams(seen[2]?.body);
    assert.equal(rb.get('payment_intent'), 'pi_3TESTINTENT01');
    assert.equal(rb.get('amount'), '2500');
    reply = { status: 200, body: { id: 're_2', status: 'pending' } };
    assert.equal(
      (
        await adapter.refund(ctx, {
          idempotencyKey: 'rf_2:refund',
          processorTransactionId: 'pi_3TESTINTENT01',
          amount: Money.parse('1'),
          reason: null,
        })
      ).status,
      'pending',
    );
    reply = {
      status: 400,
      body: {
        error: { type: 'invalid_request_error', code: 'charge_already_refunded', message: 'x' },
      },
    };
    assert.equal(
      (
        await adapter.refund(ctx, {
          idempotencyKey: 'rf_3:refund',
          processorTransactionId: 'pi_3TESTINTENT01',
          amount: Money.parse('1'),
          reason: null,
        })
      ).status,
      'declined',
    );
    reply = { status: 200, body: intent() };
    const status = await adapter.getTransaction(ctx, 'pi_3TESTINTENT01');
    assert.equal(status.status, 'authorized');
    assert.equal(seen.at(-1)?.method, 'GET');
    assert.ok(seen.at(-1)?.url.includes('expand[0]=latest_charge'));
    await assert.rejects(() => adapter.getTransaction(ctx, '../../v1/charges'));
  });

  await check('failures: keys, environment, outages', async () => {
    reply = {
      status: 401,
      body: {
        error: { type: 'invalid_request_error', message: 'Invalid API Key provided: sk_test_***' },
      },
    };
    await assert.rejects(() => adapter.authorize(ctx, input), /did not accept the key/);
    reply = { status: 503, body: {} };
    await assert.rejects(() => adapter.authorize(ctx, input));
    reply = { status: 429, body: {} };
    await assert.rejects(() => adapter.authorize(ctx, input));
    seen.length = 0;
    await assert.rejects(
      () => adapter.authorize({ ...ctx, environment: 'live' }, input),
      /environment/,
    );
    await assert.rejects(
      () =>
        adapter.authorize(
          {
            ...ctx,
            credentials: { ...ctx.credentials, publishableKey: 'pk_live_ABCDEFGHIJKLMNOP1234' },
          },
          input,
        ),
      /environment/,
    );
    assert.equal(seen.length, 0, 'no request is sent with a mixed environment');
    const live: AdapterContext = {
      ...ctx,
      environment: 'live',
      credentials: {
        ...ctx.credentials,
        secretKey: `rk_${'live'}_ABCDEFGHIJKLMNOP1234`,
        publishableKey: 'pk_live_ABCDEFGHIJKLMNOP1234',
      },
    };
    reply = { status: 200, body: intent() };
    assert.equal((await adapter.authorize(live, input)).status, 'authorized');
  });

  await check('test connection and checkout session', async () => {
    reply = { status: 200, body: { object: 'list', data: [] } };
    assert.deepEqual(await adapter.testConnection(ctx), {
      ok: true,
      message: 'Stripe accepted the key.',
      details: { mode: 'sandbox' },
    });
    assert.equal(seen[0]?.url, 'https://api.stripe.com/v1/payment_intents?limit=1');
    reply = { status: 401, body: { error: { message: 'bad key' } } };
    const bad = await adapter.testConnection(ctx);
    assert.equal(bad.ok, false);
    assert.ok(!JSON.stringify(bad).includes('sk_test'));
    assert.equal((await adapter.testConnection({ ...ctx, environment: 'live' })).ok, false);
    const session = await adapter.createCheckoutSession(ctx, {
      idempotencyKey: 'k',
      amount: Money.parse('120.50'),
      invoiceId: 'i',
      companyId: 'c',
      returnUrl: 'https://app.example.com/x',
      threeDS: 'preferred',
    });
    assert.deepEqual(session.clientConfig, {
      publishableKey: 'pk_test_ABCDEFGHIJKLMNOP1234',
      stripeAccount: '',
      amount: '12050',
      currency: 'usd',
      captureMethod: 'manual',
    });
    assert.ok(
      !JSON.stringify(session).includes('sk_test') && !JSON.stringify(session).includes('whsec'),
    );
  });

  await check(
    'webhook signature: valid, wrong secret, tampered body, stale, future, missing, multiple v1, scheme v0 only',
    async () => {
      const secret = 'whsec_ABCDEFGHIJKLMNOP1234';
      const body = JSON.stringify({
        id: 'evt_1',
        type: 'payment_intent.succeeded',
        created: 1_700_000_000,
        data: { object: { id: 'pi_1' } },
      });
      const t = 1_700_000_000;
      const sign = (key: string, ts: number, payload: string): string =>
        createHmac('sha256', key).update(`${ts}.${payload}`).digest('hex');
      const header = `t=${t},v1=${sign(secret, t, body)},v0=${'0'.repeat(64)}`;
      assert.equal(await verifyStripeSignature(secret, header, body, t + 10), true);
      assert.equal(await verifyStripeSignature(secret, header, body, t + 300), true);
      assert.equal(await verifyStripeSignature(secret, header, body, t + 301), false, 'stale');
      assert.equal(await verifyStripeSignature(secret, header, body, t - 301), false, 'future');
      assert.equal(await verifyStripeSignature('whsec_other', header, body, t), false);
      assert.equal(await verifyStripeSignature(secret, header, `${body} `, t), false, 'tampered');
      assert.equal(await verifyStripeSignature(secret, undefined, body, t), false);
      assert.equal(await verifyStripeSignature(secret, 'garbage', body, t), false);
      assert.equal(
        await verifyStripeSignature(secret, `t=${t},v0=${sign(secret, t, body)}`, body, t),
        false,
        'v0 only is not accepted',
      );
      assert.equal(
        await verifyStripeSignature(
          secret,
          `t=${t},v1=${'a'.repeat(64)},v1=${sign(secret, t, body)}`,
          body,
          t,
        ),
        true,
        'any v1 may match',
      );
      assert.equal(
        await verifyStripeSignature(secret, header, body, t, 0),
        false,
        'tolerance 0 is refused',
      );
      assert.equal(await verifyStripeSignature('', header, body, t), false);
      const viaAdapter = await adapter.verifyWebhook(ctx, {
        headers: {
          'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=${sign(secret, Math.floor(Date.now() / 1000), body)}`,
        },
        rawBody: body,
      });
      assert.equal(viaAdapter, true);
      assert.equal(await adapter.verifyWebhook(ctx, { headers: {}, rawBody: body }), false);
    },
  );

  await check('webhook parsing', () => {
    const e = (type: string, object: Record<string, unknown>): string =>
      JSON.stringify({ id: `evt_${type}`, type, created: 1_700_000_000, data: { object } });
    const pick = (
      type: string,
      object: Record<string, unknown>,
    ): ReturnType<typeof parseStripeEvent> =>
      adapter.parseWebhook({ headers: {}, rawBody: e(type, object) });
    assert.deepEqual(
      [
        pick('payment_intent.succeeded', { id: 'pi_1' }).type,
        pick('payment_intent.succeeded', { id: 'pi_1' }).processorTransactionId,
      ],
      ['payment.captured', 'pi_1'],
    );
    assert.equal(
      pick('payment_intent.amount_capturable_updated', { id: 'pi_1' }).type,
      'payment.authorized',
    );
    assert.equal(pick('payment_intent.payment_failed', { id: 'pi_1' }).type, 'payment.failed');
    assert.equal(pick('payment_intent.canceled', { id: 'pi_1' }).type, 'payment.voided');
    const refunded = pick('charge.refunded', { id: 'ch_1', payment_intent: 'pi_9' });
    assert.deepEqual(
      [refunded.type, refunded.processorTransactionId],
      ['payment.refunded', 'pi_9'],
    );
    const opened = pick('charge.dispute.created', {
      id: 'dp_1',
      payment_intent: 'pi_9',
      status: 'needs_response',
    });
    assert.deepEqual(
      [opened.type, opened.processorTransactionId, opened.payload.disputeId],
      ['dispute.opened', 'pi_9', 'dp_1'],
    );
    assert.equal(
      pick('charge.dispute.closed', { id: 'dp_1', payment_intent: 'pi_9', status: 'won' }).payload
        .outcome,
      'won',
    );
    assert.equal(
      pick('charge.dispute.closed', { id: 'dp_1', payment_intent: 'pi_9', status: 'lost' }).payload
        .outcome,
      'lost',
    );
    assert.equal(
      pick('charge.dispute.closed', {
        id: 'dp_1',
        payment_intent: 'pi_9',
        status: 'warning_closed',
      }).payload.outcome,
      undefined,
    );
    const other = pick('customer.created', { id: 'cus_1' });
    assert.equal(other.type, 'unknown');
    assert.equal(other.eventId, 'evt_customer.created');
    assert.equal(other.occurredAt, '2023-11-14T22:13:20.000Z');
    assert.throws(() => adapter.parseWebhook({ headers: {}, rawBody: 'not json' }));
  });

  setTransportForVerification(null);
  process.stdout.write(`step11-stripe: ${checks} checks passed\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
