// path: lib/integrations/shopify.ts
// Shopify Admin GraphQL calls (host {store}.myshopify.com, version 2026-10). Documentation read 2026-10-23:
// docs/integrations/shopify.md. The access token goes in the X-Shopify-Access-Token header.
import 'server-only';
import { SHOPIFY_API_VERSION, SHOPIFY_WEBHOOK_TOPICS } from '@/config/s16-commerce';
import { CommerceApiError, callStore, defaultTransport, type Transport } from './commerce-http';

export interface ShopifyConnection {
  shopDomain: string;
  accessToken: string;
}

const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};

async function graphql(
  c: ShopifyConnection,
  query: string,
  variables: Record<string, unknown>,
  transport: Transport,
): Promise<Record<string, unknown>> {
  const { json } = await callStore(
    `https://${c.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: { 'x-shopify-access-token': c.accessToken },
      json: { query, variables },
    },
    transport,
  );
  const body = obj(json);
  if (Array.isArray(body.errors) && body.errors.length > 0)
    throw new CommerceApiError(
      String(obj(body.errors[0]).message ?? 'Shopify refused the request.').slice(0, 300),
      200,
      false,
    );
  return obj(body.data);
}

/** A cheap read that proves the token belongs to the store: the shop name and its currency. */
export async function checkShopify(
  c: ShopifyConnection,
  transport: Transport = defaultTransport,
): Promise<{ name: string; currency: string }> {
  const data = await graphql(c, 'query { shop { name currencyCode } }', {}, transport);
  const shop = obj(data.shop);
  return {
    name: typeof shop.name === 'string' ? shop.name.slice(0, 120) : '',
    currency: typeof shop.currencyCode === 'string' ? shop.currencyCode : '',
  };
}

const MUTATION = `mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    userErrors { field message }
    webhookSubscription { id topic }
  }
}`;

/**
 * Subscribes the store to the order and refund topics, delivering JSON to the address. A subscription that already exists for the
 * same address is not an error. Returns the topics that are now subscribed.
 */
export async function registerShopifyWebhooks(
  c: ShopifyConnection,
  uri: string,
  transport: Transport = defaultTransport,
): Promise<string[]> {
  const done: string[] = [];
  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    const data = await graphql(
      c,
      MUTATION,
      { topic, webhookSubscription: { uri, format: 'JSON' } },
      transport,
    );
    const errors = obj(data.webhookSubscriptionCreate).userErrors;
    const first = Array.isArray(errors) ? obj(errors[0]) : {};
    const message = typeof first.message === 'string' ? first.message : '';
    if (message !== '' && !/already been taken|already exists/i.test(message))
      throw new CommerceApiError(message.slice(0, 300), 200, false);
    done.push(topic);
  }
  return done;
}
