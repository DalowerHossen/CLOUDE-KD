# WooCommerce - facts read for STEP 16.5

Read on 2026-10-23 from the official WooCommerce REST API documentation (`https://woocommerce.github.io/woocommerce-rest-api-docs/`, WP REST API v3, fetched with `curl`). Nothing here is from memory; what was not read is listed at the end. Live calls were not made (no store), so the code is checked with a fake transport (`scripts/verify/step16-commerce.ts`).

## REST API

- Base `https://{store}/wp-json/wc/v3/` (WooCommerce 3.5 or later, WordPress 4.4 or later, pretty permalinks on). Authentication over HTTPS: HTTP Basic with the consumer key as user name and the consumer secret as password (some servers need the keys as query parameters instead; not used here because a key in an address can be logged).
- `GET /orders` (list all orders, `per_page`) is the connection check.
- `POST /webhooks` creates a webhook: `name`, `topic` (`order.created`, `order.updated`, ...), `delivery_url`, `secret` (the key that signs deliveries; it defaults to an MD5 hash of the user id, so the platform sets its own).

## Webhook deliveries

- HTTP POST (`wp_remote_post`, processed in the background by wp-cron), JSON body that is exactly the REST API order. Headers: `X-WC-Webhook-Source`, `X-WC-Webhook-Topic`, `X-WC-Webhook-Resource`, `X-WC-Webhook-Event`, `X-WC-Webhook-Signature` (base64 HMAC-SHA256 of the payload), `X-WC-Webhook-ID` (the webhook), `X-WC-Webhook-Delivery-ID` (the delivery log id). After 5 consecutive deliveries that did not answer 2xx the webhook is disabled and must be edited through the REST API to turn it on again.
- The webhook address of the platform is `/api/webhooks/woocommerce?k=<random key of the store>`. The webhook secret is made by the platform, kept encrypted and shown to nobody.

## Order fields used

`id`, `number`, `status` (`pending`, `processing`, `on-hold`, `completed`, `cancelled`, `refunded`, `failed`, `trash`), `currency`, `total` (text), `date_created_gmt`, `customer_id` (0 for a guest), `billing { first_name, last_name, company, address_1, city, state, postcode, country, email, phone }`, `line_items[] { id, name, sku, quantity, price }`, `refunds[]`.

## Not read (not built)

- A WooCommerce refund as its own event (an `order.updated` delivery lists `refunds`, but the platform does not read it: no credit note is made); products, stock and customers sync; the legacy API; reading orders from the API to catch up after downtime; the ping the store sends when a webhook is created (a signed body that is not an order is answered 200 and ignored).
