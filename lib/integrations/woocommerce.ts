// path: lib/integrations/woocommerce.ts
// WooCommerce REST API v3 calls ({store}/wp-json/wc/v3). Documentation read 2026-10-23: docs/integrations/woocommerce.md.
// HTTP Basic authentication over https: the consumer key is the user name and the consumer secret the password.
import 'server-only';
import { WOOCOMMERCE_API_PATH, WOOCOMMERCE_WEBHOOK_TOPICS } from '@/config/s16-commerce';
import { callStore, defaultTransport, type Transport } from './commerce-http';

export interface WooConnection {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

const basic = (c: WooConnection): string =>
  `Basic ${Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString('base64')}`;

/** A cheap read that proves the keys belong to the store and may read orders (the newest order, one row). */
export async function checkWoo(
  c: WooConnection,
  transport: Transport = defaultTransport,
): Promise<{ name: string }> {
  await callStore(
    `${c.storeUrl}${WOOCOMMERCE_API_PATH}/orders?per_page=1`,
    { method: 'GET', headers: { authorization: basic(c) } },
    transport,
  );
  return { name: new URL(c.storeUrl).hostname.slice(0, 120) };
}

/**
 * Creates the webhooks for new and changed orders. The secret is ours (the store signs every delivery with it, and the
 * platform checks the signature). Returns the topics that were created.
 */
export async function registerWooWebhooks(
  c: WooConnection,
  deliveryUrl: string,
  secret: string,
  transport: Transport = defaultTransport,
): Promise<string[]> {
  const done: string[] = [];
  for (const topic of WOOCOMMERCE_WEBHOOK_TOPICS) {
    await callStore(
      `${c.storeUrl}${WOOCOMMERCE_API_PATH}/webhooks`,
      {
        method: 'POST',
        headers: { authorization: basic(c) },
        json: { name: `KD SOLUTION IT ${topic}`, topic, delivery_url: deliveryUrl, secret },
      },
      transport,
    );
    done.push(topic);
  }
  return done;
}
