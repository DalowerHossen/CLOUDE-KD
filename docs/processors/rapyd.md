# Rapyd - documentation record

## 1. Sources read
Read in this session on 2026-10-18 (UTC) from Rapyd's own documentation site https://docs.rapyd.net (every page fetched as Markdown by appending `.md`; the index is https://docs.rapyd.net/llms.txt).
- Overview: llms.txt (environments, authentication, idempotency, webhooks), Rapyd Checkout Overview, Hosted Checkout Page Integration, Checkout Toolkit Integration, Complete Payment, Checkout Errors.
- API: Request Signatures, Create Checkout Page, Retrieve Checkout Page, Create Payment (fields), Retrieve Payment, Capture Payment, Cancel Payment, Create Refund, Card Payments.
- Webhooks: Webhook Authentication, Webhook Security, Defining a Webhook Endpoint, Payment Succeeded / Captured / Failed / Canceled / Expired / Reversed / Updated, Refund Completed / Failed / Rejected, Dispute Created / Updated.
- Testing: Testing for Payment API, Card Numbers for Testing, Error Simulation, Simulated Errors, Simulating 3DS Authentication.
Not read: the individual error code tables (General Errors, Payment Errors) and the 3DS simulation details.

## 2. Authentication and credential fields
Every request carries the headers `access_key`, `salt` (random, 8 to 16 characters), `timestamp` (Unix seconds, at most 60 seconds off), `signature` and `Content-Type: application/json`. **signature = Base64( hex-text( HMAC-SHA256( key = secret_key, message = http_method(lower case) + url_path(with query) + salt + timestamp + access_key + secret_key + body_string ) ) )**: the HMAC is turned into lower-case hexadecimal text and that text is Base64-encoded (the Node sample: `Buffer.from(hash.digest("hex")).toString("base64")`). The body string is the exact JSON text sent, without whitespace; an empty body is empty text, never `{}`. POST requests that create objects or move money may carry an `idempotency` header. Credential fields (names only): `accessKey` (secret), `secretKey` (secret), `webhookUrl` (the exact URL typed in the Client Portal webhook settings; it is part of the webhook signature), `merchantCountry` (two-letter country of the checkout page, which decides the available card methods).

## 3. Environments
Sandbox `https://sandboxapi.rapyd.net`, production `https://api.rapyd.net`; sandbox data stays in the sandbox. Toolkit script: sandbox `https://sandboxcheckouttoolkit.rapyd.net`, production `https://checkouttoolkit.rapyd.net`. The hosted page lives at `https://sandboxcheckout.rapyd.net` (sandbox) and `https://checkout.rapyd.net`.

## 4. Secure form
Checkout Toolkit (the card fields are inside Rapyd's own iframe). The server creates a **checkout page** (below) and returns its id (`checkout_...`). The browser loads the toolkit script, adds `<div id="rapyd-checkout">`, creates `new RapydCheckoutToolkit({ id, pay_button_text, close_on_complete: true, wait_on_payment_redirect: true })` and calls `displayCheckout()`. On success the window event `onCheckoutPaymentSuccess` carries the payment object; its `id` (`payment_...`) is the payment token handed to the platform. `onCheckoutPaymentFailure` carries an error message; `onCheckoutPaymentPending` and `onCheckoutPaymentExpired` end the attempt. The toolkit needs exactly one payment method category on the page: `card`. 3D Secure is run by the checkout (the payer is redirected; with `wait_on_payment_redirect` the frame closes first). The toolkit is global (window events), so the form removes its listeners on unmount.

## 5. Operations (REST, JSON)
- Create the payment: `POST /v1/checkout` `{ amount, currency: "USD", country, merchant_reference_id: <invoice id, at most 45 characters>, metadata: { invoice_id, company_id }, payment_method_type_categories: ["card"], capture: true, complete_payment_url, error_payment_url, cancel_checkout_url, complete_checkout_url, language: "en", payment_expiration: 3600 }` with an `idempotency` header. The amount is sent as the shortest decimal (`120.5`, `120`: "if the amount is a whole number, use an integer"). Answer `data.id` (`checkout_...`), `data.redirect_url`, `data.payment` (null id until paid). The return URLs must be https and not localhost.
- Verify (`authorize` and `charge`, same code; `supportsAuthCapture` is false): `GET /v1/payments/{payment}`; answer `{ status: { status: "SUCCESS" | "ERROR", error_code, message, operation_id }, data: Payment }`. The adapter requires `status` `CLO`, `paid` and `captured` true, `currency_code` USD, `amount` equal to the invoice, `payment_method_type_category` `card`, and `merchant_reference_id` equal to the invoice id (or `metadata.invoice_id`).
- No separate authorization step (`capture: true`); no void.
- Refund: `POST /v1/refunds` `{ payment, amount, reason, merchant_reference_id }` (an `idempotency` header; omitting `amount` refunds all). Answer `data.status`: `Completed`, `Pending`, `Rejected`, `Error`, `Canceled`; `data.id` `refund_...`.
- Connection test: `GET /v1/payments/payment_kd_connection_check` - an `ERROR_GET_PAYMENT` error (payment not found) means the signature and keys were accepted; an authentication error code or HTTP 401 means refused.
- Our `processorTransactionId` is the payment id. Amounts in answers are JSON numbers.

## 6. 3D Secure
Run by Rapyd Checkout (redirect to the issuer page). The payment carries `authentication_result` (`eci`, `result` A/N/R/U, `version`), but the platform's 3DS policy cannot steer the checkout, so `supportsThreeDS: false`; every result is `{ requested: false, completed: false, authenticated: false, liabilityShift: null }`.

## 7. Card identity (REQ-CARD)
`payment_method_data.fingerprint_token` ("hash of the card number, expiration date and CVV", type `fingerprint`) when present; otherwise `bin_number|last4|expiry_month/expiry_year|brand`.

## 8. Decline mapping
Source: `failure_code` / status `error_code` (for example `ERROR_PROCESSING_CARD - [51]`). Only codes shown in the sandbox documentation are mapped: `[51]` insufficient_funds, `[05]` do_not_honor, `[43]` processor_fraud_signal; everything else is `other`. Simulation: card 4111111111111105 (do not honor), 4111111111111143 (stolen card), 4111111111111151 (insufficient funds).

## 9. Webhooks
One URL for the company (Client Portal, Developers, Webhooks, Management) with a choice of events. Headers `salt`, `signature`, `timestamp`; body `{ id, type, data, created_at, trigger_operation_id, ... }` (the sample also carries `token` `wh_...`). **Signature**: Base64( hex-text( HMAC-SHA256( key = secret_key, message = webhookUrl + salt + timestamp + access_key + secret_key + body_string ) ) ) with the body text exactly as sent. The page states no time limit for the timestamp; the adapter accepts a timestamp at most five minutes from now (a stated choice, not a Rapyd rule).
- Events used: `PAYMENT_CAPTURED` -> payment.captured; `PAYMENT_FAILED` -> payment.failed; `PAYMENT_CANCELED`, `PAYMENT_EXPIRED`, `PAYMENT_REVERSED` -> payment.voided; `REFUND_COMPLETED` -> payment.refunded (payment id in `data.payment`); `PAYMENT_REFUND_FAILED`, `PAYMENT_REFUND_REJECTED` -> unknown; `PAYMENT_DISPUTE_CREATED` -> dispute.opened and `PAYMENT_DISPUTE_UPDATED` -> dispute.updated (payment id in `data.original_transaction_id`); `PAYMENT_SUCCEEDED` (the payment request was accepted, not necessarily paid) -> unknown.
- Event id: the webhook `id`, falling back to `token`. The time is `extended_timestamp` (milliseconds) or `created_at` (seconds).

## 10. Idempotency
`idempotency` header on `POST /v1/checkout` and `POST /v1/refunds`; the adapter sends the platform's key (hashed to 40 characters). A timeout is treated as unknown and retried with the same key.

## 11. Test data
Sandbox cards 4111111111111111 and 4462030000000000 succeed; any future expiry, any three-digit security code. Error cards in section 8. Amounts 4000 to 4009 (gateway not responding), 2000 to 2009 (settlement declined), 2080 to 2089 (processor unavailable) simulate errors for online payments.

## 12. Limits and capabilities
`supportsAuthCapture` false (one-step sale with `capture: true`); `supportsRefund` true; `supportsPartialRefund` true; `supportsRecurring` false; `supportsPayout` false (Rapyd Disburse exists, not used); not a merchant of record. Currency USD. Cards only (the toolkit shows one category). The platform webhook URL must be typed exactly in the credentials.

## 12a. Content security policy
Scripts and frames: `https://sandboxcheckouttoolkit.rapyd.net`, `https://sandboxcheckout.rapyd.net`, `https://checkouttoolkit.rapyd.net`, `https://checkout.rapyd.net`; the issuer 3DS pages open by redirect.

## 13. Open questions
1. Whether the payment created by the checkout carries the checkout page's `merchant_reference_id` and `metadata`.
2. Whether the toolkit success event always carries a closed, paid payment or can fire for a 3DS payment still active.
3. The `payment` field name inside refund webhooks (`data.payment` is from the sample).
4. Whether a numeric string amount is accepted (the adapter sends a number).
5. The webhook timestamp tolerance and the retry schedule.
6. The error code Rapyd returns for a refund above the remaining amount.
