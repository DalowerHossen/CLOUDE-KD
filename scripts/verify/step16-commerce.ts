// path: scripts/verify/step16-commerce.ts
// Logic checks of the store connections (16.5) that need no database or network: the addresses and inputs, the signature checks of
// Shopify and WooCommerce against signatures made with node:crypto, reading a Shopify and a WooCommerce order, the conflicts, the
// retry delays and sync mode steps, and the store calls with a fake transport that follows the documentation (docs/integrations/
// shopify.md and woocommerce.md): the address, where the credentials travel, the bodies, the answers, error handling and that the
// credentials are never in an error message. The tables are tested in sql/assertions/s16_014_commerce.sql. Webhook routes, the
// order service and the pages need a running app and real stores.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-commerce.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { CommerceApiError, callStore, type Transport } from '@/lib/integrations/commerce-http';
import {
  amountText,
  clientNameOf,
  conflictResolution,
  conflictsOf,
  connectInput,
  connectionUpdate,
  handleAfter,
  mappingInput,
  normaliseShopDomain,
  normaliseStoreUrl,
  normalizeShopifyOrder,
  normalizeWooOrder,
  readShopifyRefund,
  retryAt,
  skusOf,
  verifyShopifySignature,
  verifyWooSignature,
} from '@/lib/integrations/mapping-rules';
import { checkShopify, registerShopifyWebhooks } from '@/lib/integrations/shopify';
import { checkWoo, registerWooWebhooks } from '@/lib/integrations/woocommerce';

let checks = 0;
const check = async (name: string, fn: () => void | Promise<void>): Promise<void> => {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}
const fake = (
  answers: { status?: number; json: unknown }[],
): { calls: Call[]; transport: Transport } => {
  const calls: Call[] = [];
  let i = 0;
  return {
    calls,
    transport: async (url, options) => {
      calls.push({ url, method: options.method, headers: options.headers, body: options.body });
      const a = answers[Math.min(i, answers.length - 1)] ?? { json: {} };
      i += 1;
      return { status: a.status ?? 200, body: Buffer.from(JSON.stringify(a.json)) };
    },
  };
};

const TOKEN = 'shpat_secrettoken0123456789abcdef';
const SECRET = 'whsec_clientsecret0123456789';
const SHOP_ORDER = {
  id: 450789469,
  name: '#1001',
  email: 'Bob.Norman@Mail.Example.com',
  currency: 'USD',
  total_price: '409.94',
  created_at: '2026-10-20T10:15:00-04:00',
  cancelled_at: null,
  customer: {
    id: 207119551,
    email: 'bob.norman@mail.example.com',
    first_name: 'Bob',
    last_name: 'Norman',
  },
  billing_address: {
    address1: '2259 Park Ct',
    city: 'Drayton Valley',
    province: 'AB',
    zip: 'T7A 1B2',
    country_code: 'CA',
  },
  line_items: [
    { id: 1, sku: 'IPOD-342-N', title: 'IPod Nano', quantity: 1, price: '199.00' },
    { id: 2, sku: 'ipod-343', title: 'IPod Touch', quantity: 2, price: '105.0000' },
  ],
};
const WOO_ORDER = {
  id: 727,
  number: '727',
  status: 'processing',
  currency: 'USD',
  total: '29.35',
  date_created_gmt: '2026-10-20T14:15:00',
  customer_id: 0,
  billing: {
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    address_1: '969 Market',
    city: 'San Francisco',
    state: 'CA',
    postcode: '94103',
    country: 'US',
  },
  line_items: [{ id: 315, name: 'Woo Single #1', sku: 'WOO-1', quantity: 1, price: 29.35 }],
};

async function main(): Promise<void> {
  await check(
    'addresses: a Shopify store ends in .myshopify.com; a Woo store is an https origin',
    () => {
      assert.equal(normaliseShopDomain('https://My-Shop.myshopify.com/'), 'my-shop.myshopify.com');
      assert.equal(normaliseShopDomain('my-shop.myshopify.com'), 'my-shop.myshopify.com');
      assert.equal(normaliseShopDomain('my-shop.example.com'), null);
      assert.equal(normaliseShopDomain('evil.com/x.myshopify.com'), null);
      assert.equal(normaliseShopDomain('a.myshopify.com.evil.com'), null);
      assert.equal(
        normaliseStoreUrl('https://Shop.Example.com/store/'),
        'https://shop.example.com',
      );
      assert.equal(normaliseStoreUrl('http://shop.example.com'), null);
      assert.equal(normaliseStoreUrl('https://user:pw@shop.example.com'), null);
      assert.equal(normaliseStoreUrl('https://localhost'), null);
      assert.equal(normaliseStoreUrl('https://shop.example.com:8443'), null);
    },
  );

  await check('inputs: strict, with the credential shapes of each store', () => {
    const shopify = {
      provider: 'shopify',
      name: 'Main',
      shopDomain: 'main.myshopify.com',
      accessToken: TOKEN,
      clientSecret: SECRET,
    };
    assert.ok(connectInput.safeParse(shopify).success);
    assert.equal(connectInput.parse(shopify).syncMode, 'realtime');
    assert.ok(!connectInput.safeParse({ ...shopify, extra: 1 }).success);
    assert.ok(!connectInput.safeParse({ ...shopify, shopDomain: 'x.example.com' }).success);
    assert.ok(!connectInput.safeParse({ ...shopify, name: '<b>x</b>' }).success);
    const woo = {
      provider: 'woocommerce',
      name: 'Woo',
      storeUrl: 'https://woo.example.com',
      consumerKey: `ck_${'a'.repeat(40)}`,
      consumerSecret: `cs_${'b'.repeat(40)}`,
      syncMode: 'hourly',
    };
    assert.ok(connectInput.safeParse(woo).success);
    assert.ok(!connectInput.safeParse({ ...woo, consumerKey: 'abc' }).success);
    assert.ok(!connectInput.safeParse({ ...woo, syncMode: 'weekly' }).success);
    assert.ok(connectionUpdate.safeParse({ version: 2, status: 'paused' }).success);
    assert.ok(!connectionUpdate.safeParse({ status: 'paused' }).success);
    assert.ok(!connectionUpdate.safeParse({ version: 1, provider: 'woocommerce' }).success);
    assert.ok(
      mappingInput.safeParse({
        externalSku: 'ABC-1',
        productId: '11111111-1111-4111-8111-111111111111',
      }).success,
    );
    assert.ok(!mappingInput.safeParse({ externalSku: '', productId: 'x' }).success);
    assert.ok(conflictResolution.safeParse({ resolution: 'ignored' }).success);
    assert.ok(!conflictResolution.safeParse({ resolution: 'deleted' }).success);
  });

  await check('signatures: the base64 HMAC-SHA256 of the raw body, compared exactly', async () => {
    const body = JSON.stringify(SHOP_ORDER);
    const good = createHmac('sha256', SECRET).update(body).digest('base64');
    assert.equal(await verifyShopifySignature(SECRET, body, good), true);
    assert.equal(await verifyShopifySignature(SECRET, `${body} `, good), false);
    assert.equal(await verifyShopifySignature('other-secret-0123456789', body, good), false);
    assert.equal(await verifyShopifySignature(SECRET, body, null), false);
    assert.equal(await verifyShopifySignature(SECRET, body, ''), false);
    assert.equal(await verifyShopifySignature(SECRET, body, good.slice(0, -2)), false);
    const woo = createHmac('sha256', 'woo-webhook-secret').update(body).digest('base64');
    assert.equal(await verifyWooSignature('woo-webhook-secret', body, woo), true);
    assert.equal(await verifyWooSignature('woo-webhook-secret', body, good), false);
    assert.equal(await verifyWooSignature('woo-webhook-secret', body, null), false);
  });

  await check(
    'Shopify order: e-mail in lower case, amounts as text with four places, lines, billing and the order number',
    () => {
      const o = normalizeShopifyOrder(SHOP_ORDER);
      assert.ok(o);
      assert.equal(o.externalId, '450789469');
      assert.equal(o.number, '#1001');
      assert.equal(o.email, 'bob.norman@mail.example.com');
      assert.equal(o.customerName, 'Bob Norman');
      assert.equal(o.currency, 'USD');
      assert.equal(o.total, '409.9400');
      assert.equal(o.lines.length, 2);
      assert.equal(o.lines[1]?.unitPrice, '105.0000');
      assert.equal(o.lines[1]?.quantity, 2);
      assert.equal(o.billing?.postalCode, 'T7A 1B2');
      assert.equal(o.cancelled, false);
      assert.equal(
        normalizeShopifyOrder({ ...SHOP_ORDER, cancelled_at: '2026-10-21T00:00:00Z' })?.cancelled,
        true,
      );
      assert.equal(normalizeShopifyOrder({ ...SHOP_ORDER, line_items: [] }), null);
      assert.equal(normalizeShopifyOrder({ ...SHOP_ORDER, id: {} }), null);
      assert.equal(
        normalizeShopifyOrder({ ...SHOP_ORDER, line_items: [{ id: 1, quantity: 0, price: '1' }] }),
        null,
      );
      assert.equal(
        normalizeShopifyOrder({ ...SHOP_ORDER, line_items: [{ id: 1, quantity: 1, price: '-1' }] }),
        null,
      );
      assert.equal(normalizeShopifyOrder('not an order'), null);
      assert.equal(
        normalizeShopifyOrder({ ...SHOP_ORDER, email: 'not-an-email', customer: {} })?.email,
        null,
      );
      assert.equal(
        normalizeShopifyOrder({ ...SHOP_ORDER, customer: { first_name: '<b>Bob</b>' } })
          ?.customerName,
        'bBob/b',
      );
    },
  );

  await check(
    'WooCommerce order: status, GMT time, numeric prices, guest customer, billing',
    () => {
      const o = normalizeWooOrder(WOO_ORDER);
      assert.ok(o);
      assert.equal(o.externalId, '727');
      assert.equal(o.number, '727');
      assert.equal(o.email, 'jane@example.com');
      assert.equal(o.customerName, 'Jane Doe');
      assert.equal(o.customerExternalId, null);
      assert.equal(o.total, '29.3500');
      assert.equal(o.lines[0]?.unitPrice, '29.3500');
      assert.equal(o.orderedAt, '2026-10-20T14:15:00.000Z');
      assert.equal(o.billing?.postalCode, '94103');
      assert.equal(o.cancelled, false);
      assert.equal(normalizeWooOrder({ ...WOO_ORDER, status: 'cancelled' })?.cancelled, true);
      assert.equal(normalizeWooOrder({ ...WOO_ORDER, line_items: undefined }), null);
    },
  );

  await check('amounts: plain decimals only, always with four places (rounded half up)', () => {
    assert.equal(amountText('12.5'), '12.5000');
    assert.equal(amountText(12), '12.0000');
    assert.equal(amountText('0.00005'), '0.0001');
    assert.equal(amountText('-1'), null);
    assert.equal(amountText('1e3'), null);
    assert.equal(amountText('abc'), null);
    assert.equal(amountText('1'.repeat(20)), null);
  });

  await check(
    'conflicts: another currency, an unmapped or missing SKU, no e-mail, no billing address',
    () => {
      const order = normalizeShopifyOrder(SHOP_ORDER);
      assert.ok(order);
      assert.deepEqual(skusOf(order), ['ipod-342-n', 'ipod-343']);
      assert.deepEqual(conflictsOf(order, new Set(['ipod-342-n', 'ipod-343'])), []);
      const missing = conflictsOf(order, new Set(['ipod-343']));
      assert.equal(missing.length, 1);
      assert.equal(missing[0]?.kind, 'unmapped_sku');
      assert.match(missing[0]?.detail ?? '', /IPOD-342-N/);
      const eur = conflictsOf({ ...order, currency: 'EUR' }, new Set(['ipod-342-n', 'ipod-343']));
      assert.deepEqual(
        eur.map((c) => c.kind),
        ['currency'],
      );
      const bare = conflictsOf(
        {
          ...order,
          email: null,
          billing: null,
          lines: [{ externalId: '9', sku: null, title: 'Gift', quantity: 1, unitPrice: '1' }],
        },
        new Set(),
      );
      assert.deepEqual(bare.map((c) => c.kind).sort(), ['no_address', 'no_email', 'unmapped_sku']);
      const twice = conflictsOf(
        { ...order, lines: [order.lines[0]!, { ...order.lines[0]!, externalId: '5' }] },
        new Set(),
      );
      assert.equal(twice.length, 1);
      assert.equal(clientNameOf(order), 'Bob Norman');
      assert.equal(clientNameOf({ ...order, customerName: null }), 'bob.norman@mail.example.com');
    },
  );

  await check('refund: the refund id and the order it belongs to', () => {
    assert.deepEqual(readShopifyRefund({ id: 929361462, order_id: 450789469 }), {
      refundId: '929361462',
      orderId: '450789469',
    });
    assert.equal(readShopifyRefund({ id: 1 }), null);
    assert.equal(readShopifyRefund(null), null);
  });

  await check('retry: 5 minutes, 30 minutes, 2 hours, 12 hours; none after the last try', () => {
    const now = new Date('2026-10-23T00:00:00Z');
    const after = (n: number): number | null => {
      const t = retryAt(n, now, 5);
      return t === null ? null : (t.getTime() - now.getTime()) / 60_000;
    };
    assert.equal(after(1), 5);
    assert.equal(after(2), 30);
    assert.equal(after(3), 120);
    assert.equal(after(4), 720);
    assert.equal(after(5), null);
  });

  await check('sync mode: at once, at the next full hour, at the next midnight (UTC)', () => {
    const now = new Date('2026-10-23T10:20:30Z');
    assert.equal(handleAfter('realtime', now).toISOString(), now.toISOString());
    assert.equal(handleAfter('hourly', now).toISOString(), '2026-10-23T11:00:00.000Z');
    assert.equal(handleAfter('daily', now).toISOString(), '2026-10-24T00:00:00.000Z');
  });

  await check(
    'Shopify: the token is a header, the query is GraphQL on the versioned address',
    async () => {
      const f = fake([{ json: { data: { shop: { name: 'Main shop', currencyCode: 'USD' } } } }]);
      const r = await checkShopify(
        { shopDomain: 'main.myshopify.com', accessToken: TOKEN },
        f.transport,
      );
      assert.deepEqual(r, { name: 'Main shop', currency: 'USD' });
      assert.equal(f.calls[0]?.url, 'https://main.myshopify.com/admin/api/2026-10/graphql.json');
      assert.equal(f.calls[0]?.method, 'POST');
      assert.equal(f.calls[0]?.headers['x-shopify-access-token'], TOKEN);
      assert.ok(!(f.calls[0]?.url ?? '').includes(TOKEN));
      assert.match(String(f.calls[0]?.body), /shop \{ name currencyCode \}/);
    },
  );

  await check(
    'Shopify: one subscription for each topic, JSON to our address; "already taken" is fine',
    async () => {
      const f = fake([
        {
          json: {
            data: {
              webhookSubscriptionCreate: { userErrors: [], webhookSubscription: { id: 'gid://1' } },
            },
          },
        },
        {
          json: {
            data: {
              webhookSubscriptionCreate: {
                userErrors: [
                  { field: ['x'], message: 'Address for this topic has already been taken' },
                ],
              },
            },
          },
        },
        { json: { data: { webhookSubscriptionCreate: { userErrors: [] } } } },
      ]);
      const topics = await registerShopifyWebhooks(
        { shopDomain: 'main.myshopify.com', accessToken: TOKEN },
        'https://app.example.com/api/webhooks/shopify?k=abc',
        f.transport,
      );
      assert.deepEqual(topics, ['ORDERS_CREATE', 'ORDERS_UPDATED', 'REFUNDS_CREATE']);
      const first = JSON.parse(String(f.calls[0]?.body)) as {
        variables: { topic: string; webhookSubscription: { uri: string; format: string } };
      };
      assert.equal(first.variables.topic, 'ORDERS_CREATE');
      assert.equal(first.variables.webhookSubscription.format, 'JSON');
      assert.equal(
        first.variables.webhookSubscription.uri,
        'https://app.example.com/api/webhooks/shopify?k=abc',
      );
      const bad = fake([
        {
          json: {
            data: { webhookSubscriptionCreate: { userErrors: [{ message: 'Topic is invalid' }] } },
          },
        },
      ]);
      await assert.rejects(
        registerShopifyWebhooks(
          { shopDomain: 'main.myshopify.com', accessToken: TOKEN },
          'https://app.example.com/x',
          bad.transport,
        ),
        CommerceApiError,
      );
      const gql = fake([
        { json: { errors: [{ message: 'Access denied for webhookSubscriptionCreate field.' }] } },
      ]);
      await assert.rejects(
        checkShopify({ shopDomain: 'main.myshopify.com', accessToken: TOKEN }, gql.transport),
        CommerceApiError,
      );
    },
  );

  await check(
    'WooCommerce: Basic authentication over https, a read to check, one webhook for each topic with our secret',
    async () => {
      const key = `ck_${'a'.repeat(40)}`;
      const secret = `cs_${'b'.repeat(40)}`;
      const f = fake([{ json: [] }]);
      const r = await checkWoo(
        { storeUrl: 'https://woo.example.com', consumerKey: key, consumerSecret: secret },
        f.transport,
      );
      assert.equal(r.name, 'woo.example.com');
      assert.equal(f.calls[0]?.url, 'https://woo.example.com/wp-json/wc/v3/orders?per_page=1');
      assert.equal(
        f.calls[0]?.headers.authorization,
        `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
      );
      assert.ok(!(f.calls[0]?.url ?? '').includes(key));
      const w = fake([{ status: 201, json: { id: 142 } }]);
      const topics = await registerWooWebhooks(
        { storeUrl: 'https://woo.example.com', consumerKey: key, consumerSecret: secret },
        'https://app.example.com/api/webhooks/woocommerce?k=abc',
        'hook-secret-123',
        w.transport,
      );
      assert.deepEqual(topics, ['order.created', 'order.updated']);
      assert.equal(w.calls[0]?.url, 'https://woo.example.com/wp-json/wc/v3/webhooks');
      assert.deepEqual(JSON.parse(String(w.calls[0]?.body)), {
        name: 'KD SOLUTION IT order.created',
        topic: 'order.created',
        delivery_url: 'https://app.example.com/api/webhooks/woocommerce?k=abc',
        secret: 'hook-secret-123',
      });
    },
  );

  await check(
    'store errors: 401 and 403 mean connect again, 429 and 5xx are retried, the credentials are never in the message',
    async () => {
      const attempt = async (status: number): Promise<CommerceApiError> => {
        const f = fake([{ status, json: { message: `Failure ${status} for ${TOKEN}` } }]);
        try {
          await callStore(
            'https://main.myshopify.com/x',
            { method: 'GET', headers: { 'x-shopify-access-token': TOKEN } },
            f.transport,
          );
        } catch (e) {
          assert.ok(e instanceof CommerceApiError);
          return e;
        }
        throw new Error('must throw');
      };
      const e401 = await attempt(401);
      assert.equal(e401.authRefused, true);
      assert.equal(e401.retryable, false);
      assert.ok(!e401.message.includes(TOKEN));
      assert.equal((await attempt(403)).authRefused, true);
      assert.equal((await attempt(429)).retryable, true);
      assert.equal((await attempt(503)).retryable, true);
      const e400 = await attempt(400);
      assert.equal(e400.retryable, false);
      assert.equal(e400.authRefused, false);
      const down: Transport = async () => {
        throw new Error(`socket closed for ${TOKEN}`);
      };
      await assert.rejects(
        callStore('https://main.myshopify.com/x', { method: 'GET', headers: {} }, down),
        (e: unknown) => e instanceof CommerceApiError && e.retryable && !e.message.includes(TOKEN),
      );
    },
  );

  await check(
    'store address guard: plain http, loopback and private addresses are refused before any call',
    async () => {
      for (const url of [
        'http://shop.example.com/x',
        'https://127.0.0.1/x',
        'https://localhost/x',
        'https://10.0.0.5/x',
        'https://[::1]/x',
      ]) {
        await assert.rejects(
          callStore(url, { method: 'GET', headers: {} }),
          (e: unknown) => e instanceof CommerceApiError && !e.retryable && e.httpStatus === 0,
          url,
        );
      }
    },
  );

  process.stdout.write(`step16-commerce: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
