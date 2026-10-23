# Shopify - facts read for STEP 16.5

Read on 2026-10-23 from the official documentation (`https://shopify.dev/docs/...<page>.md`, fetched with `curl`). Nothing here is from memory; what was not read is listed at the end. Live calls were not made (no store), so the code is checked with a fake transport that follows these shapes (`scripts/verify/step16-commerce.ts`).

## Sources

- `apps/build/webhooks.md`, `apps/build/webhooks/delivery-structure.md`, `apps/build/webhooks/verify-deliveries.md`, `apps/build/webhooks/subscribe.md`
- `apps/build/authentication-authorization.md`
- `api/usage/versioning.md`
- `api/admin-graphql/latest/mutations/webhookSubscriptionCreate.md`, `.../input-objects/WebhookSubscriptionInput.md`, `.../queries/shop.md`, `.../objects/Shop.md`
- `api/admin-rest/latest/resources/order.md` (the field names of the order that a webhook delivers: the delivery carries the REST resource)

## Admin API

- Address `https://{store}.myshopify.com/admin/api/2026-10/graphql.json`, POST, header `X-Shopify-Access-Token: <token>`. 2026-10 is the latest stable version (released 2026-10-01, supported until 2027-10-16); a version is always named in the address.
- The credential of an app made in the Shopify admin is an Admin API access token (offline). The app also has a client ID and a client secret; the secret signs webhook deliveries.
- `query { shop { name currencyCode } }` returns the shop the token belongs to (used as the connection check).
- Subscribing: `mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!)` with `topic` in screaming case (`ORDERS_CREATE`, `ORDERS_UPDATED`, `REFUNDS_CREATE`) and `webhookSubscription { uri, format: JSON }`; the answer has `userErrors { field message }`. Custom apps made in the admin cannot use the CLI, so subscriptions are made through this mutation. Failing subscriptions made by the Admin API are deleted by Shopify after 8 failed deliveries.

## Webhook deliveries

- HTTPS POST, JSON body (the full REST resource of the topic unless `include_fields` is set), headers `X-Shopify-Topic`, `X-Shopify-Hmac-Sha256` (base64 HMAC-SHA256 of the raw body with the app client secret), `X-Shopify-Shop-Domain`, `X-Shopify-API-Version`, `X-Shopify-Webhook-Id` (unique per delivery; used to ignore repeats), `X-Shopify-Triggered-At`, `X-Shopify-Event-Id`.
- Answer `200` within 5 seconds (1 second to connect); anything else is an error. Retried 8 times over 4 hours. Order across topics is not guaranteed; deliveries can repeat.
- The webhook address of the platform is `/api/webhooks/shopify?k=<random key of the store>`. The key finds the store; the signature is the proof. The store domain header must match the connected store.

## Order fields used

`id`, `name` (for example `#1001`), `email`, `currency`, `total_price` (text), `created_at`, `cancelled_at`, `customer { id, email, first_name, last_name }`, `billing_address { address1, city, province, zip, country_code }`, `line_items[] { id, sku, title, quantity, price }`. Refund deliveries (`refunds/create`) carry `id` and `order_id`. Only the last 60 days of orders can be read through the API by default (the platform does not read old orders; it works from deliveries). Access to customer data needs approval for a public app; an app made in the store's own admin has it.

## Not read (not built)

- The OAuth authorization code flow and the client credentials grant (a store is connected by pasting the Admin API token and the client secret); registering webhooks through `shopify.app.toml`; GraphQL cost and rate limits (a 429 is retried later); fulfillment and order status written back to Shopify; reading orders from the API to catch up after downtime (reconciliation job); products and inventory sync; GDPR mandatory webhooks of public apps (the platform is not a public app).
