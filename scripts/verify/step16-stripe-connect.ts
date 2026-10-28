// path: scripts/verify/step16-stripe-connect.ts
// Stripe Connect (docs/processors/stripe.md section 13): the connected account and the onboarding link are made with the
// documented v2 bodies, webhook endpoints are made with the Connect flag, a company account adds the Stripe-Account header,
// the browser form gets the account, and the webhook check accepts the secret of either endpoint.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-stripe-connect.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { adapter } from '@/lib/payment/adapters/stripe';
import { setTransportForVerification, type HttpRequest } from '@/lib/payment/http-client';
import {
  cardPaymentsStatus,
  createConnectedAccount,
  createOnboardingLink,
  createWebhookEndpoint,
} from '@/lib/payment/onboarding/stripe-connect';
import { Money } from '@/lib/utils/currency';
import type { AdapterContext } from '@/types/contracts';

let checks = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
}

const KEY = 'sk_test_0123456789abcdefghij';
const seen: HttpRequest[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: {} };
setTransportForVerification(async (request) => {
  seen.push(request);
  return { status: reply.status, text: JSON.stringify(reply.body), headers: {} };
});

const ctx = (credentials: Record<string, string>): AdapterContext => ({
  credentials: { secretKey: KEY, publishableKey: 'pk_test_0123456789abcdefghij', ...credentials },
  environment: 'sandbox',
  mode: 'default',
  correlationId: 'c',
});

async function main(): Promise<void> {
  await check('a connected account is made with the documented v2 body', async () => {
    seen.length = 0;
    reply = { status: 200, body: { id: 'acct_1Nv0FGQ9RKHgCVdK' } };
    const id = await createConnectedAccount(KEY, {
      email: 'a@b.co',
      displayName: 'Co',
      country: 'US',
    });
    assert.equal(id, 'acct_1Nv0FGQ9RKHgCVdK');
    assert.equal(seen[0]?.url, 'https://api.stripe.com/v2/core/accounts');
    assert.equal(seen[0]?.headers.authorization, `Bearer ${KEY}`);
    assert.equal(seen[0]?.headers['content-type'], 'application/json');
    const body = JSON.parse(seen[0]?.body ?? '{}') as Record<string, unknown>;
    assert.equal(body.dashboard, 'full');
    assert.deepEqual(body.defaults, {
      responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
    });
    assert.deepEqual(body.identity, { country: 'us', entity_type: 'company' });
  });

  await check(
    'the onboarding link is made for one account and only a stripe.com address is accepted',
    async () => {
      seen.length = 0;
      reply = { status: 200, body: { url: 'https://accounts.stripe.com/r/acct_1#alu_x' } };
      const url = await createOnboardingLink(KEY, {
        accountId: 'acct_1Nv0FGQ9RKHgCVdK',
        returnUrl: 'https://app.example/return',
        refreshUrl: 'https://app.example/refresh',
      });
      assert.ok(url.startsWith('https://accounts.stripe.com/'));
      assert.equal(seen[0]?.url, 'https://api.stripe.com/v2/core/account_links');
      const body = JSON.parse(seen[0]?.body ?? '{}') as { use_case: { type: string } };
      assert.equal(body.use_case.type, 'account_onboarding');
      reply = { status: 200, body: { url: 'https://evil.example.com/x' } };
      await assert.rejects(
        createOnboardingLink(KEY, {
          accountId: 'acct_1Nv0FGQ9RKHgCVdK',
          returnUrl: 'https://a.b/r',
          refreshUrl: 'https://a.b/f',
        }),
        /unexpected/,
      );
    },
  );

  await check('card payments status is read from the merchant configuration', async () => {
    reply = {
      status: 200,
      body: {
        configuration: { merchant: { capabilities: { card_payments: { status: 'active' } } } },
      },
    };
    assert.equal(await cardPaymentsStatus(KEY, 'acct_1Nv0FGQ9RKHgCVdK'), 'active');
    reply = {
      status: 200,
      body: {
        configuration: { merchant: { capabilities: { card_payments: { status: 'restricted' } } } },
      },
    };
    assert.equal(await cardPaymentsStatus(KEY, 'acct_1Nv0FGQ9RKHgCVdK'), 'restricted');
    await assert.rejects(cardPaymentsStatus(KEY, 'not-an-account'), /Not a Stripe account id/);
  });

  await check('webhook endpoints: the Connect flag, and the secret comes back', async () => {
    seen.length = 0;
    reply = { status: 200, body: { id: 'we_1', secret: 'whsec_0123456789abcdefghij' } };
    const made = await createWebhookEndpoint(KEY, {
      url: 'https://app.example/api/webhooks/stripe',
      events: ['payment_intent.succeeded'],
      connect: true,
      description: 'd',
    });
    assert.equal(made.secret, 'whsec_0123456789abcdefghij');
    const body = seen[0]?.body ?? '';
    assert.match(body, /connect=true/);
    assert.match(body, /enabled_events\[0\]=payment_intent\.succeeded/);
    assert.equal(seen[0]?.url, 'https://api.stripe.com/v1/webhook_endpoints');
    reply = { status: 400, body: { error: { message: 'Not a Connect platform.' } } };
    await assert.rejects(
      createWebhookEndpoint(KEY, {
        url: 'https://a.b/c',
        events: ['x'],
        connect: true,
        description: 'd',
      }),
      /Not a Connect platform/,
    );
  });

  await check(
    'a company account adds the Stripe-Account header; the platform account does not',
    async () => {
      seen.length = 0;
      reply = { status: 200, body: { id: 'pi_1234567', status: 'succeeded', amount: 100 } };
      await adapter.getTransaction(
        ctx({ connectedAccountId: 'acct_1Nv0FGQ9RKHgCVdK' }),
        'pi_1234567',
      );
      assert.equal(seen[0]?.headers['stripe-account'], 'acct_1Nv0FGQ9RKHgCVdK');
      seen.length = 0;
      await adapter.getTransaction(ctx({}), 'pi_1234567');
      assert.equal(seen[0]?.headers['stripe-account'], undefined);
    },
  );

  await check('the browser form gets the account of the company', async () => {
    const input = {
      idempotencyKey: 'k',
      amount: Money.parse('1.00'),
      invoiceId: 'i',
      companyId: 'c',
      returnUrl: 'https://a.b/r',
      threeDS: 'disabled' as const,
    };
    const session = await adapter.createCheckoutSession(
      ctx({ connectedAccountId: 'acct_1Nv0FGQ9RKHgCVdK' }),
      input,
    );
    assert.equal(session.clientConfig.stripeAccount, 'acct_1Nv0FGQ9RKHgCVdK');
    const plain = await adapter.createCheckoutSession(ctx({}), input);
    assert.equal(plain.clientConfig.stripeAccount, '');
  });

  await check('the webhook check accepts the secret of either endpoint', async () => {
    const body = '{"id":"evt_1","type":"payment_intent.succeeded"}';
    const now = Math.floor(Date.now() / 1000);
    const sign = (secret: string): string =>
      `t=${now},v1=${createHmac('sha256', secret).update(`${now}.${body}`).digest('hex')}`;
    const platform = 'whsec_platformplatformplatform';
    const connect = 'whsec_connectconnectconnectcon';
    const c = ctx({ webhookSecret: platform, connectWebhookSecret: connect });
    const request = (secret: string): { headers: Record<string, string>; rawBody: string } => ({
      headers: { 'stripe-signature': sign(secret) },
      rawBody: body,
    });
    assert.equal(await adapter.verifyWebhook(c, request(platform)), true);
    assert.equal(await adapter.verifyWebhook(c, request(connect)), true);
    assert.equal(await adapter.verifyWebhook(c, request('whsec_otherotherotherotherother')), false);
    assert.equal(
      await adapter.verifyWebhook(ctx({ webhookSecret: platform }), request(connect)),
      false,
    );
  });

  setTransportForVerification(null);
  process.stdout.write(`step16-stripe-connect: ${checks} checks passed\n`);
}

void main();
