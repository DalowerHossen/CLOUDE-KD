# NMI - documentation record

## 1. Sources read
Read in this session on 2026-10-18 (UTC) from NMI's own documentation site https://docs.nmi.com (every page fetched as Markdown by appending `.md`; the index is https://docs.nmi.com/llms.txt). The OpenAPI definitions embedded in the reference pages were read for exact field names. `secure.nmi.com` (the Integration Portal that holds the Collect.js reference) and `sandbox.nmi.com` are not reachable from this environment.
- Guides: Online Payments Overview, Payment Component, Integrating the Frontend Component, Implement Backend, Test and Deploy, Customize Styling, Collect.js, Surcharging with Card Type Detection (Collect.js), Gateway.js, Payer Authentication (3DS) and its sandbox testing page, Get Your API Keys, Enabling Test Mode, Classic API Migration Playbook, Code Examples.
- Reference: Sale, Authorization, Capture, Void, Refund, Get payment (REST API v5, "Payments API" 1.0.0), Transaction Processing (Classic `transact.php`, for the server address only), Webhooks Overview, Retry Logic, Transaction Events, Response Codes.

## 2. Authentication and credential fields
Server calls: JSON over HTTPS; the header `Authorization: <private security key>` (the bare key, no `Bearer`); `Content-Type: application/json`. Keys are created in the Merchant Portal under Settings, Security Keys. A **public** key with Checkout permission is the "tokenization key" that identifies the merchant to the browser scripts. Credential fields (names only): `privateKey` (secret), `tokenizationKey` (not secret), `webhookSigningKey` (secret; shown on the Webhooks settings page). Money: amounts are JSON **numbers** in major units with two decimals (`x.xx`); the adapter prints them from cents as bare numbers (never through floating point) in `nmi/shared-server.ts`.

## 3. Environments
REST API sandbox `https://sandbox.nmi.com/api` (paths `/v5/payments/...`). **The production address of the REST API is not stated on any page read** (blocker B2 of STEP 12): a live account is refused by the adapter before any call. Browser scripts: Gateway.js sandbox `https://sandbox.nmi.com/js/v1/Gateway.js`, production `https://secure.nmi.com/js/v1/Gateway.js`; Collect.js `https://secure.nmi.com/token/Collect.js` (production, from the 3DS example). A sandbox account is free (guide.nmi.com, "set up a free sandbox account"); its Merchant Portal and keys are at guide.nmi.com; a sandbox account is already in test mode (test mode approves every valid card and moves no money).

## 4. Secure form - the two modes (REQ-NMI-MODES)
- **`collectjs` (default).** Collect.js tokenizes in the browser: `<script src="https://secure.nmi.com/token/Collect.js" data-tokenization-key="...">`, then `CollectJS.configure({ variant: 'inline', fields: { ccnumber: { selector, title }, ccexp: {...}, cvv: {...} }, callback(response), lookUpCallback(response) })`. `callback` receives `{ tokenType, token, card: { number, bin, exp, type, category, hash } }`. The token is **single use and expires 24 hours after creation**. NMI states Collect.js is for existing integrations. **The way a submission is triggered (the payment button option or method) is not on any page read** (blocker B1): the form is therefore not written.
- **`payment_component`.** The Payment Component (npm packages `@nmipayments/nmi-pay-react` and `@nmipayments/nmi-pay`, or Gateway.js) renders the fields and tokenizes: `<NmiPayments tokenizationKey onPay onChange onExpressCheckout onFieldsAvailable />`; `onPay({ token, lookupData })` shows the component's own pay button and expects a promise of `true` (success) or an error text; `onChange({ token, complete, lookupData })` is for 3DS flows; `resetFields()` after a failed payment. The documents give **no version number** for the packages. The package request is in `docs/steps/STEP-12/DEPENDENCY_REQUESTS.md`; the form waits for the Integrator.
Both modes end the same way: the server receives a payment token and calls `nmi/shared-server.ts`. Our payment token = the NMI payment token.

## 5. Operations (REST v5, JSON)
- Authorize: `POST /v5/payments/auth`; sale (authorize and capture): `POST /v5/payments/sale`. Body: `amount` (number), `currency`, `payment_details: { payment_token }`, `billing_address` (`zip`, `country`, ...), `order_details` (`order_id`, `ip_address`, ...), `dup_seconds` (duplicate window), `partial_payments`, `cardholder_auth`, `cit_mit`. Answer `200 TransactionResponse`: `object: "transaction"`, `id`, `amount` (string `x.xx`), `currency`, `auth_code`, `avs_response`, `cvv_response`, `status`, `response` (`1` approved, `2` declined, `3` error), `response_text`, `response_code`, `payment_details` (`card_number` masked, `card_exp`, `card_hash`, `card_type`, `card_bin`, `cavv`, `eci`), `billing_address`, `order_details`, `actions[]` (`type`, `amount`, `success`, `response`, ...). Errors: `400/401/404` with `{ type, error_code, message, ref_id, details }`.
- Capture: `POST /v5/payments/{payment_id}/capture` `{ amount }` ("equal to or less than the authorized amount"). The adapter captures only the full authorized amount.
- Void: `POST /v5/payments/{payment_id}/void` (`void_reason` only for EMV); only unsettled payments.
- Refund: `POST /v5/payments/{payment_id}/refund` `{ amount, payment }`; only settled payments; amount `0.00` would refund everything, so the adapter always sends the real amount. A full refund of a payment that is still `pendingsettlement` is done as a void.
- Look up: `GET /v5/payments/{payment_id}` (404 not found). `condition` values in the webhook body: `pending`, `pendingsettlement`, `in_progress`, `abandoned`, `failed`, `canceled`, `complete`, `unknown`.
- Connection test (per mode): the tokenization key must be present and well formed; then `GET /v5/payments/kd-connection-check` - 404 (or 400) means the private key was accepted, 401 means refused.
- Our `processorTransactionId` is the payment `id`.

## 6. 3D Secure
3DS is a separate browser step (Gateway.js `get3DSecure()`, `createUI`, events `challenge`, `complete`, `failure`) whose result (`cavv`, `xid`, `eci`, `cardHolderAuth`, `threeDsVersion`, `directoryServerId`) is sent in `cardholder_auth`. It needs the payer's first and last name, e-mail, address, city, state, country and postal code, which the platform's checkout input does not carry (STEP 11 request R4). The adapter declares `supportsThreeDS: false`; every result is `{ requested: false, completed: false, authenticated: false, liabilityShift: null }`. Sandbox 3DS test cards exist (frictionless 4100000000000100; challenge 4100000000005000, code 12345 passes).

## 7. Card identity (REQ-CARD)
`payment_details.card_hash` ("Card hash") when the gateway returns it (type `fingerprint`); the documents do not say how it is computed or whether it is stable across payments. When it is empty the adapter builds `bin|last4|exp|type` from `card_bin`, the masked `card_number`, `card_exp` and `card_type`.

## 8. Decline mapping
Source: `response_code` (Payment API response codes) with `response` 2.
- insufficient_funds: 202, 203
- invalid_number: 220, 221, 222, 461
- invalid_expiry: 223, 224
- invalid_cvv: 225
- processor_fraud_signal: 250, 251, 252, 253
- do_not_honor: 200, 201, 204, 226, 240, 260, 261, 262, 263, 264
- processor_error: 300, 400, 410, 411, 420, 421, 440, 441, 460
- other: 430 (duplicate) and everything else
`response` 3 (error in data or system) is reported as `error`. Success code 100. AVS: ZIP matches for X, Y, D, M, 2, 6, W, Z, P, L, 1, 5; mismatch for A, 3, 7, N, C, 4, 8; the rest are unknown.

## 9. Webhooks
Created in the Merchant Portal (Settings, Webhooks, Create); the URL must be `https` with valid TLS; events are selected by category (transactions, check status, recurring, settlement, chargebacks, card updater), most with `success`, `failure` and `unknown` variants. Body: `{ event_id, event_type, event_body }`; transaction events carry `event_body.transaction_id`, `transaction_type`, `condition`, `requested_amount`, `card`, addresses. **Signature**: header `Webhook-Signature: t=<nonce>,s=<signature>`; `signature = hex(HMAC-SHA256(signing key, nonce + "." + raw body))`; the key is the "webhooks signing key" of the Webhooks settings page. The page gives no time limit for the nonce, so there is no timestamp window. Deliveries come only from `104.192.32.81` to `.87` and `104.192.36.81` to `.87` (the platform cannot check the source address in the adapter). Retries: up to 20 over 3 days while the answer is not HTTP 200.
- Events used: `transaction.sale.success`, `transaction.capture.success` -> payment.captured; `transaction.auth.success` -> payment.authorized; `transaction.void.success` -> payment.voided; `transaction.refund.success` -> payment.refunded; `transaction.sale.failure`, `.auth.failure`, `.capture.failure` -> payment.failed; everything else -> unknown (the chargeback event names are not listed).
- `event_id` is unique and used as the event id. `processorTransactionId` = `event_body.transaction_id`. The body has no timestamp, so the time of receipt is used.

## 10. Idempotency
The REST API v5 reference documents **no idempotency header**. The only duplicate protection is the `dup_seconds` window on supported processors (set to 0 to disable). The adapter sends no idempotency key and relies on the processor's default duplicate check; a retried authorization after a timeout is therefore not provably safe (known limit). Capture, void and refund read the payment first, so a repeated capture or void is answered from the stored state.

## 11. Test data
Sandbox cards: Visa 4111111111111111, Mastercard 5431111111111111, Discover 6011000991300009, Amex 341111111111111, Diners 30205252489926, JCB 3541963594572595, Maestro 6799990100000000019; expiry 10/29. Triggers: an amount **below 1.00** gives a declined result; an invalid card number gives a fatal error; address 888 with ZIP 77777 simulates an AVS match; security code 999 simulates a CVV match. ACH test account 24413815, routing 490000018 (not used). 3DS cards in section 6.

## 12. Limits and capabilities
`supportsAuthCapture` true; `supportsThreeDS` false (section 6); `supportsRefund` true; `supportsPartialRefund` true (after settlement); `supportsRecurring` false (Customer Vault and subscriptions exist, not used); `supportsPayout` false; not a merchant of record. Currency `USD`. Modes `collectjs` (default) and `payment_component`. A capture is for the full authorized amount only. Cards only (ACH and wallets not used). Neither browser form is written yet (B1 and the pending package), so the checkout shows "unavailable" for NMI; the adapter, the connection test per mode, the webhook and the shared server module are complete. Live use needs blocker B2 resolved.

## 12a. Content security policy
Sandbox: script and frames `https://sandbox.nmi.com`. The hosts used by the frames of each mode are not documented on the pages read; production hosts include `https://secure.nmi.com`.

## 13. Open questions
1. Collect.js: how a submission is triggered (B1); `variant` values other than `inline`; the exact `fields` options.
2. The production REST API address (B2).
3. The Payment Component package version and its React peer dependency (package request).
4. `GET /v5/payments/{id}`: the values of `status` and the `type` strings of `actions[]` (the adapter reads `actions` by keywords: void, refund or credit, capture or sale or settle, auth; an unreadable payment is `pending`, never success), and whether a refund answer carries the refund's own id.
5. How a token behaves when reused or after 24 hours (the documents say single use and 24 hours); the sandbox run records the error shape.
6. Whether a decline is HTTP 200 with `response: "2"` or an HTTP error; the adapter handles both.
7. Chargeback webhook event names.
