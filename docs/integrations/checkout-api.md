# Hosted checkout API (STEP 16.16)

For stores (WooCommerce, Shopify, your own code) that take payments on the platform's payment page. The buyer needs no account. You need a **live key with the scope `write:checkout`**, which the dashboard offers after your business check (KYC) is approved (`Developers > Store checkout`).

## 1. Make a session for an order

```
POST /api/public/v1/checkout/sessions
Authorization: Bearer kd_live_...
Idempotency-Key: <16 to 128 characters, new for each order>
Content-Type: application/json

{
  "order_id": "WC-1001",
  "amount": "49.90",
  "currency": "USD",
  "customer": { "name": "Ann Lee", "email": "ann@example.com", "country": "US", "postal_code": "10001" },
  "description": "Order WC-1001",
  "success_url": "https://shop.example/thank-you",
  "cancel_url": "https://shop.example/cart",
  "expires_in_hours": 24,
  "metadata": { "cart": "abc" }
}
```

Answer `201`:

```
{ "data": { "id": "<uuid>", "order_id": "WC-1001", "status": "open", "amount": "49.90", "currency": "USD",
            "checkout_url": "https://<platform>/pay/<token>", "expires_at": "...", "paid_at": null, "created_at": "..." } }
```

- Send the buyer to `checkout_url`. The page shows the platform's brand and your company name; the buyer pays by card and is sent back to `success_url` (or `cancel_url`) with `kd_session`, `kd_order` and `kd_result` added. **Do not mark an order paid because the buyer came back; wait for the webhook or read the session.**
- **One order id is one session.** Asking again with the same order id and the same amount and e-mail returns the same session (`200`). A different amount or buyer for the same order id is `409`; a paid order is `409` (`This order is already paid`); a cancelled order needs a new order id. A session that ran out opens again with a new link on the same unpaid invoice.
- `409 This order is being prepared`: ask again after a moment.
- `403`: the key is a sandbox key, or the KYC is not approved. Sandbox keys cannot make checkout sessions.
- `amount` is text with at most two decimals, tax included. Only USD.

## 2. Read or cancel

- `GET /api/public/v1/checkout/sessions/{id}` (scope `read:checkout`): `status` is `open`, `paid`, `cancelled` or `expired`.
- `DELETE /api/public/v1/checkout/sessions/{id}` (scope `write:checkout`): the order was cancelled in your store. The link stops working and the unpaid invoice is voided. A paid order cannot be cancelled; refund it from the payments page.

## 3. Webhooks

Make a webhook endpoint (`Developers > Webhooks`) for `checkout.session.paid` and `checkout.session.failed`. Check the signature as described there. The `data` of an event holds `sessionId`, `orderId`, `amount`, `currency`, `status` and, for paid, `paidAt`; for failed, a `reason`. A failed event does not close the session: the buyer may try again with the same link. Use the event id to ignore a repeat. Mark the order paid in your store only after checking the order id and the amount.

## WooCommerce and Shopify

Neither platform needs the platform's code on the buyer's side: a small plugin or app on your store does the calls above.

- WooCommerce: a payment gateway plugin whose `process_payment()` calls step 1 with the order total and the order key as `order_id`, returns `['result' => 'success', 'redirect' => checkout_url]`, and a webhook receiver that calls `$order->payment_complete()` on `checkout.session.paid`.
- Shopify: an app that creates the session when the buyer chooses the payment method, redirects to `checkout_url`, and resolves the payment on `checkout.session.paid`.

Keep the key on the store's server. Rotate it from `Developers > API keys`.

## Limits

Live keys only. USD only. A company with required custom fields on clients must make those fields optional first. The buyer's browser loads the processor's own secure card form, so the processor can be seen by looking at the page; your account never shows which processor or master merchant the platform uses.
