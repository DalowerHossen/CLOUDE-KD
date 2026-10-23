# FastSpring - documentation record

## 1. Sources read
Read in this session on 2026-10-18 (UTC) from FastSpring's own documentation site https://developer.fastspring.com (every page fetched as Markdown; the index is https://developer.fastspring.com/llms.txt). The OpenAPI definitions embedded in the reference pages were read for exact field names.
- Guides: Set up Component Checkouts, Test orders, Refund an order, Gross pricing mode and net pricing mode.
- Reference: API overview (authentication), Sessions overview, Create session, Retrieve session, Retrieve an order, Create a return, Retrieve a return, Checkout Components (overview, configuration, callbacks, card, pay button, vanilla JS), Webhooks overview, Message security, Processed and unprocessed webhook events, Webhook expansion, and the event pages order.completed, order.failed, order.payment.pending, return.created, chargeback.created.

## 2. Authentication and credential fields
Server calls: `https://api.fastspring.com`, HTTP Basic (`Authorization: Basic base64(username:password)`); the API credentials are created in the FastSpring app (Developer Tools, APIs) and the password is shown once. Credential fields (names only): `username` (not secret), `password` (secret), `checkoutPath` (`store-id/checkout-id`, not secret), `checkoutUrl` (the Component Checkout address from Implementation tab, not secret), `productPath` (path of the catalog product that carries the invoice price, not secret), `webhookSecret` (secret; the HMAC SHA256 secret typed on the webhook). Money: amounts are JSON **numbers** in major units; the adapter prints them from cents as bare numbers (never through floating point) in `fastspring/api.ts`.

## 3. Environments
There is **one API host**. Test mode is a property of the order: the session field `live` (default `true`; forced to `false` when the checkout is in test mode) and the order field `live`. The adapter sends `live: false` for the sandbox environment and `live: true` for the live one, and refuses an order whose `live` differs from the environment. Test orders do not move money (Test orders guide).

## 4. Secure form
Checkout Components (Beta, "available on request": FastSpring Support or the CSM must enable it for the store). The script is loaded from `https://cdn.onfastspring.com/checkout-sdk/latest/fastspring-sdk.js` (the npm package `@fastspring/checkout-sdk` also exists and is not needed). The page adds `FastSpring.init({ checkoutUrl, onOrderCompleted, onPaymentFailed })`, then `sdk.components.create('fs-card' | 'fs-pay-button' | 'fs-disclosures').mount(selector)`, then `sdk.checkout(sessionId, { onSuccess, onError })`. The card inputs are in FastSpring's own iframes. Card, pay button and disclosures are required. The pay button belongs to FastSpring, so the platform's submit label is not used. The origin of the page must be on the allow list of the Component Checkout. The session is single use and expires, so `sdk.checkout` is called once per session. `onOrderCompleted(data)` receives `data.id` (the order id): that id is the payment token handed to the platform.

## 5. Operations (REST, JSON)
- Create the payment: `POST /v2/checkouts/{storeId}/{checkoutId}/sessions` with `live`, `orderTags: { invoice_id }`, `cart.lineItems: [{ productPath, quantity: 1, customPrice: { unitPrice: { USD: <number> } } }]`. Answer `201` with the session `id`, `checkoutUrls.webcheckoutUrl`, `checkoutStatus` (`READY_FOR_CHECKOUT` when the cart is valid). `customPrice` and `orderTags` need the authenticated request.
- Verify (`authorize` and `charge`, same code; `supportsAuthCapture` is false): `GET /orders/{order_id}` (an object, or an array when several ids are given; the adapter accepts either). The adapter requires `completed` true, `live` equal to the environment, `currency` USD, and `subtotal` or `total` equal to the invoice amount (see section 12 on tax).
- No authorization or capture, no void.
- Refund: `POST /returns` `{ returns: [{ order, reason, note, notification: "NONE", refundType: "FULL" }] }`, or `refundType: "PARTIAL"` with `items: [{ product: productPath, amount: <number> }]`. Answer `200 { returns: [{ return, completed, totalReturn, ... }] }`; a refused item comes back as `{ returns: [{ action, result: "error", error: { ... } }] }` with HTTP 400. Refunds of orders older than six months, orders with an open dispute, real-time payment methods and high-risk orders must go through FastSpring Support.
- Connection test: `GET /orders/kd-connection-check` - 401 means the credentials were refused, any other answer (a 400 "order not found" error object) means they were accepted.
- Our `processorTransactionId` is the order id.

## 6. 3D Secure
Handled inside FastSpring's checkout; the order does not expose a 3DS result in the pages read. `supportsThreeDS: false`; every result is `{ requested: false, completed: false, authenticated: false, liabilityShift: null }`.

## 7. Card identity (REQ-CARD)
No fingerprint. From `payment`: when `payment.type` is `creditcard`, the identity is `payment.creditcard` (brand) plus `payment.cardEnding` (last four) as `brand|last4`, type `fingerprint`; other payment types give no identity. The identity is weak (no BIN, no expiry), recorded as a known limit.

## 8. Decline mapping
`order.failed` and `onPaymentFailed` carry no machine-readable decline code in the pages read, so every failed attempt is `other`. `payment` is empty on a failed order.

## 9. Webhooks
Configured under Developer Tools, Webhooks (the container receives live, test or both). Body: `{ events: [ { id, live, processed, type, created, data } ] }`; one delivery may hold several events. **Signature**: header `X-FS-Signature` (case-insensitive) = base64(HMAC-SHA256(secret, raw body)); the secret is optional on FastSpring's side, but the adapter refuses an unsigned delivery. Delivery source address listed by FastSpring: 107.23.30.83 (the adapter cannot check addresses). Automatic retries carry the same event id; manual retries have new ids.
- Events used: `order.completed` -> payment.captured; `order.failed` -> payment.failed; `return.created` -> payment.refunded (`data.original.order` is the order); `chargeback.created` -> dispute.opened; everything else (including `order.payment.pending`) -> unknown.
- Of a multi-event delivery the adapter maps the first event whose type it knows (a documented limit; FastSpring's unprocessed-events list can recover the rest).
- `processorTransactionId` = `data.order` for order and chargeback events (`data.id` on orders), `data.original.order` for returns. The event time is `created` (milliseconds).

## 10. Idempotency
No idempotency header is documented for sessions or returns. A session is created once per payment; `authorize` and `charge` read the stored order; a repeated refund creates a second return (FastSpring refuses an amount above the remaining total).

## 11. Test data
Test cards (Test orders guide): 4242 4242 4242 4242 is a successful card; 4000 0000 0000 0127 and 4000 0000 0000 0002 force failures (generic decline). Any future expiry and any security code. Orders created in a `live: false` session are test orders.

## 12. Limits and capabilities
`supportsAuthCapture` false (one-step sale); `supportsThreeDS` false (section 6); `supportsRefund` true; `supportsPartialRefund` true; `supportsRecurring` false; `supportsPayout` false; **`isMerchantOfRecord` true** (FastSpring is the seller of record, collects and remits tax and pays the merchant after fees). Currency USD. **Tax**: in Net Pricing Mode, or for US and Canada buyers in the Gross modes, tax is added on top of the price, so `total` can exceed the invoice; the adapter accepts an order whose `subtotal` equals the invoice amount and records the total, and refuses otherwise. Order tags are not shown in the order payloads read, so the order is bound to the invoice by amount, currency and the rule that one processor transaction maps to one payment (unique on the platform).
Checkout Components must be enabled by FastSpring for the store (Beta).

## 12a. Content security policy
Script and frames: `https://cdn.onfastspring.com` and `https://*.onfastspring.com` (the checkout address); the exact frame hosts are not listed on the pages read.

## 13. Open questions
1. Whether `GET /orders/{id}` returns an object or an array for one id (both are accepted).
2. Whether the order payload exposes the session `orderTags`.
3. The error shape of an unknown order on `GET /orders/{id}` for a 401-versus-400 test (the schema lists `orders[].result: "error"`).
4. Whether `subtotal` is the pre-tax price in every pricing mode.
5. Which `payment.type` values besides `creditcard` and `test` appear for card orders.
6. Whether the order exists immediately when `onOrderCompleted` fires.
