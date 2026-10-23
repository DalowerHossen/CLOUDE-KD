# Paddle - documentation record (server side complete; browser side blocked, see STEP 12 blocker B5)

## 1. Sources read
Read in this session on 2026-10-18 (UTC). **`developer.paddle.com` and `cdn.paddle.com` are refused by the network policy of this environment**, so none of Paddle's guide pages could be read. What was read, all published by Paddle: the OpenAPI 3.1 description of the Paddle Billing API (`PaddleHQ/paddle-openapi`, `v1/openapi.yaml`, API version 1, 70 paths, servers sandbox and production) including its descriptions of transactions, adjustments, events, notification settings and error codes; the repository README; and the official Node library (`PaddleHQ/paddle-node-sdk`), file `src/notifications/helpers/webhooks-validator.ts`, for the webhook signature.

## 2. Authentication and credential fields
`Authorization: Bearer <API key>` (security scheme `BearerAuth`); keys carry permissions (`transaction.write`, `adjustment.write`, read permissions). Credential fields (names only): `apiKey` (secret), `clientToken` (public; client-side token for Paddle.js, Developer Tools, Authentication), `webhookSecret` (secret; the `endpoint_secret_key` of the notification destination, prefixed `pdl_ntfset_`). Money: prices and totals are strings of the **lowest denomination** (cents).

## 3. Environments
Sandbox `https://sandbox-api.paddle.com`, production `https://api.paddle.com`. A sandbox account is separate from the live one (README: sign-up at login.paddle.com). The Paddle.js script address, its sandbox switch and the checkout domain approval are on the blocked guide pages.

## 4. Secure form
Paddle Billing is a **merchant of record**: the payer pays in Paddle's own checkout (Paddle.js overlay or inline), opened for a transaction id. Flow: the server creates the transaction in `createCheckoutSession` (below), the browser opens Paddle Checkout with `transactionId` and the client-side token, and when Paddle reports the checkout complete the form hands the transaction id to the platform; `authorize`/`charge` then read the transaction back. `Transaction.checkout.url` is the "default payment URL" (a page of ours on an approved domain that runs Paddle.js) plus `?_ptxn=<transaction id>`. **The Paddle.js address and API are not in the files read, so the browser form is not written** (blocker B5); the checkout shows "unavailable" for Paddle until it is.

## 5. Operations (REST, JSON)
- Create the payment: `POST /transactions` with `items: [{ quantity: 1, price: { description, name, tax_mode: "internal", unit_price: { amount: "<cents>", currency_code: "USD" }, product: { name, tax_category: "standard" } } }]`, `currency_code`, `collection_mode: "automatic"`, `custom_data: { invoice_id, company_id }`. A non-catalog price needs a product (`TransactionPriceCreateWithProduct` requires `description`, `unit_price`, `product`). `tax_mode: internal` puts tax inside the price so the payer owes the invoice amount; the selected tax category must be enabled on the Paddle account. Answer `201 { data: Transaction }` (`id` `txn_...`, `status` draft/ready/billed/paid/completed/canceled/past_due, `checkout.url`, `details.totals.grand_total`, `details.line_items[].id` `txnitm_...`, `payments[]` with `status` (authorized, captured, error, ...), `error_code`, `method_details.card { type, last4, expiry_month, expiry_year }`).
- Verify (`authorize` and `charge`, same code): `GET /transactions/{id}`; the adapter checks `custom_data.invoice_id`, `currency_code` USD and `details.totals.grand_total` equal to the invoice amount; `completed` or `paid` = `captured`; no payment yet = "not completed".
- No authorization or capture: `supportsAuthCapture: false`, so the platform uses `charge`; no void.
- Refund: `POST /adjustments` `{ action: "refund", transaction_id, reason, type: "full" }` or `{ type: "partial", items: [{ item_id, type: "partial", amount }] }`. "Most refunds for live accounts are created `pending_approval` until reviewed by Paddle; for sandbox accounts Paddle approves refunds every ten minutes." Answer `201 { data: Adjustment }` with `id` `adj_...` and `status` (pending_approval, approved, rejected, reversed). The platform refund id is the adjustment id.
- Connection test: `GET /transactions?per_page=1` (needs a read permission).
- Errors: `{ error: { type (request_error, api_error), code, detail, errors[] }, meta }`.

## 6. 3D Secure
Handled inside Paddle Checkout; the transaction does not expose a 3DS result in the files read. `supportsThreeDS: false`; every result is `{ requested: false, completed: false, authenticated: false, liabilityShift: null }`.

## 7. Card identity (REQ-CARD)
No card fingerprint. From the payment attempt: `last4|expiry_month/expiry_year|type` (type `fingerprint`); null for non-card methods. The identity is weak (no BIN), recorded as a known limit.

## 8. Decline mapping
Source: `payments[].error_code` (enumeration `ErrorCode`): not_enough_balance -> insufficient_funds; invalid_payment_details -> invalid_number; expired_card -> invalid_expiry; authentication_failed -> three_ds_failed; fraud, blocked_card -> processor_fraud_signal; declined, declined_not_retryable, transaction_not_permitted, prepaid_card_not_supported, preferred_network_not_supported -> do_not_honor; issuer_unavailable, psp_error, system_error -> processor_error; every other code (already_canceled, already_refunded, canceled, invalid_amount, redacted_payment_method, unknown) -> other.

## 9. Webhooks
Notification destinations (webhook URL) are created in the dashboard or `POST /notification-settings`; the destination has `endpoint_secret_key`. Body `{ event_id, event_type, occurred_at, notification_id, data }`. **Signature** (official Node library): header `Paddle-Signature: ts=<unix seconds>;h1=<hex>`; `h1 = HMAC-SHA256(secret, ts + ":" + raw body)` in hexadecimal; the library rejects a timestamp more than 5 seconds old, and the adapter uses the same limit. Events used: `transaction.completed` -> payment.captured; `transaction.payment_failed` -> payment.failed; `transaction.canceled` -> payment.voided; `adjustment.updated` with action refund and status approved -> payment.refunded (transaction id from `data.transaction_id`); `adjustment.created` / `.updated` with action chargeback -> dispute.opened / dispute.updated; everything else -> unknown. Other event types in the specification (subscriptions, customers, products, payouts, ...) are not used. Retry policy and the acknowledgement rules are on the blocked pages.

## 10. Idempotency
The specification contains **no idempotency header**. Creating the transaction twice creates two transactions; the platform asks for a session once per payment, and `authorize`/`charge` and the refund read the stored state first. A repeated refund request creates a second adjustment (Paddle refuses an amount above the remaining total).

## 11. Test data
Not read (the testing guide is on the blocked pages). Sandbox refunds are approved automatically every ten minutes.

## 12. Limits and capabilities
`supportsAuthCapture` false (one-step sale); `supportsThreeDS` false (section 6); `supportsRefund` true; `supportsPartialRefund` true (one line item); `supportsRecurring` false (subscriptions exist, not used); `supportsPayout` false; **`isMerchantOfRecord` true** (Paddle sells to the payer, collects and remits tax, and pays the merchant after fees). Currency USD (the account must sell in USD). Refunds can wait for Paddle's approval and are reported as `pending` until the webhook arrives. Taxes are inside the price (`tax_mode: internal`).

## 13. Open questions
1. Paddle.js script address, `Paddle.Initialize` / `Paddle.Checkout.open` options, the completion event, sandbox switch (B5).
2. Whether the transaction must also carry a customer or address for `tax_mode: internal` to work without a checkout.
3. Whether `payments[].status` and `error_code` are filled for a failed attempt before the payer retries.
4. Webhook retry schedule and acknowledgement.
5. Test card numbers and amounts that force declines.
