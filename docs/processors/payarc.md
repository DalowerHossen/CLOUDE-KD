# PayArc - documentation record

## 1. Sources read
Read in this session on 2026-10-17 (UTC) from PayArc's own documentation site https://docs.payarc.net (every page fetched as Markdown by appending `.md`; the index is https://docs.payarc.net/llms.txt). The OpenAPI definitions embedded in the reference pages were read for exact field names.
- Guides: Getting Started, API Authentication, FAQ (test cards, response codes, idempotency), Pay By Card, Hosted Fields - IFrames (including the full demo page), Capture a payment using the Hosted Checkout Page, Voiding and Refunding Payments, 3DS.
- Reference: Create a Token - Card, Create a Charge - Keyed, Retrieve a Charge, List All Charges, Capture a Charge, Void a Charge, Refund a Charge, List All Refunds, Charges (FAQ and error statuses), WebHooks (event bodies), Add Webhooks, Who Am I, Create an Order.
- The integration `Payarc / PaymentCloud` in `config/processors.ts` lists no sandbox address; the documentation gives one (section 3).

## 2. Authentication and credential fields
Server calls: `Authorization: Bearer <API access token>`, `Accept: application/json`, `Content-Type: application/json` (form encoding is also accepted). A token belongs to one environment; a production token on the sandbox fails. Rate limit header `X-RateLimit-Limit` (30 per window). Credential fields (names only): `clientId` (not secret; the "Client ID" of the dashboard API page, used by the browser-side Hosted Fields), `accessToken` (secret; the "API Bearer Token" of the dashboard, Merchant account). Partner/agent accounts use another token and are out of scope. Money: amounts are **integers in cents** (`amount: 9` is $0.09); `currency` must be `usd`.

## 3. Environments
Sandbox API `https://testapi.payarc.net` (paths `/v1/...`), production API `https://api.payarc.net/v1`. Sandbox accounts are created by PayArc support (email to support@payarc.com stating merchant or partner sandbox); the minimum amount in the sandbox is $0.50. Hosted Fields script: sandbox `https://testportal.payarc.net/js/iframeprocess.js`; the **production address is not documented** (blocker B3). Sandbox hosted checkout host `testcheckout.payarc.net` (Orders, not used).

## 4. Secure form
**Hosted Fields - IFrames** (PCI scope reduced; the fields are PayArc-hosted iframes). The page loads `iframeprocess.js`, which defines `initPayarcTokenizer(clientId, settings)` and `getPayarcToken(buttonElement)`. The page holds a container (`FIELDS_CONTAINER`, default id `payarc-card-token-container`) with four elements marked `data-payarc="CARD_NUMBER"`, `"EXP"`, `"CVV"`, `"ZIP"` (placeholder via `data-placeholder`); `settings` = `{ FORM_STATUS, INITIATE_PAYMENT (id of the pay button), FIELDS_CONTAINER, TOKEN_CALLBACK: { success(obj), error(obj), paymentWindowClosed() } }`. On success `JSON.parse(obj.response).token` is the **single-use token id** (usable for one charge or to attach a card to a customer); the response also has the first 6 and last 4 digits. Errors: `obj.status` 200 success, 403 invalid client id, 422 validation (security code, expiry), 408/419 session expired, 409 gateway error. CSS classes `payarc-*` may be styled. Our payment token = the token id. The demo page also loads jQuery 3.7.1; whether `iframeprocess.js` needs it is not stated (open question 2). The ZIP field is inside the PayArc frame, so the platform's `billingPostalCode` is not needed.

## 5. Operations (REST, JSON)
- Authorize: `POST /v1/charges` with `amount` (cents), `currency: "usd"`, `token_id`, `capture: 0` (authorize only; "uncaptured charges expire in seven days"), optional `metadata` (a string of JSON, up to 50 keys, key at most 20 and value at most 100 characters), header `Idempotency-Key`. Answer `201 { data: Charge }` with `id`, `amount`, `amount_captured`, `captured` (0/1), `status` (`authorized`, `submitted_for_settlement`, `void`, `refunded`, `partial_refund`, `failed_by_gateway`, or the failure text such as "Invalid CVV"), `auth_code`, `failure_code` (response code such as D2020), `failure_message`, `card.data` (`fingerprint`, `brand`, `first6digit`, `last4digit`, `avs_status`, `cvc_status`, `zip_check_passed`, `address_check_passed`). Validation errors are `422 { message, errors }`. The documentation does not show the answer of a declined charge (open question 3); the adapter reads both an HTTP error with `message` and a charge with `failure_code`.
- Capture: `POST /v1/charges/{charge_id}/capture` `{ amount, tip_amount }` -> `200 { data: Charge }`; `404` unknown, `409` "Cannot initiate capture as charge is already captured". The adapter captures only the full authorized amount.
- Void: `POST /v1/charges/{charge_id}/void` `{ reason (required: requested_by_customer, fraudulent, duplicate, other), void_description (5 to 190 characters) }` -> `201 { data: Charge }` with `status: "void"`; `409` "Reversal Not Allowed." A void must happen the same day as the transaction, before settlement.
- Refund: `POST /v1/charges/{charge_id}/refunds` `{ amount (cents, whole charge when omitted), reason, description (5 to 190), do_not_send_email_to_customer, do_not_send_sms_to_customer }`. A charge can be refunded only once it has been batched; before that the answer is `422 { status: "error", message: "Return Not Allowed." }` and a void is needed. The refund object (`GET /v1/refunds`, event `Refund Created`): `id`, `refund_amount`, `status` (`refunded`, `failed_by_gateway`), `charge_id`. The refund answer is the Charge object with `refund.data[]`; its exact content is not shown (open question 4).
- Look up: `GET /v1/charges/{charge_id}`; list `GET /v1/charges?limit=`. A charge id is a 16-character alphanumeric string.
- Connection test: `GET /v1/charges?limit=1` (authenticated read; `401 { error: "Unauthenticated." }`). `GET /v1/whoami` also works with an expired token, so it is not used.
- Our `processorTransactionId` is the **charge id**; a refund result carries the refund id when the answer shows one.

## 6. 3D Secure
"3DS is only supported for Traditional merchants" and only by passing authentication values (`security_protocol`, `eci_indicator`, `ucaf_collection_indicator`, `program_protocol`, `directory_server_transaction_id`) obtained from a separate 3DS provider before the charge; "transactions may process as non-3DS if authentication values are not supplied". PayArc's Hosted Fields run no 3DS. The adapter declares `supportsThreeDS: false`; every result is `{ requested: false, completed: false, authenticated: false, liabilityShift: null }`.

## 7. Card identity (REQ-CARD)
`charge.card.data.fingerprint` (an identifier PayArc assigns per card, e.g. `Lv0NmMPNLv591505`) -> `{ type: 'fingerprint', value }`. When missing: `first6digit|last4digit|brand|exp_month/exp_year` from the same object.

## 8. Decline mapping
Source: `failure_code` (Traditional response codes of the FAQ, Payfac codes `DECLINED-nnn`) and the status text.
- insufficient_funds: D2012, DECLINED-051, "Insufficient Funds"
- invalid_number: D2005, "Invalid Card Number"
- invalid_expiry: D2011, D2028, EXPIRED CARD, "Expired Card", "Invalid Date"
- invalid_cvv: D2020, "Invalid CVV"
- three_ds_failed: D9099
- processor_fraud_signal: D2002, D2029
- do_not_honor: D2001, D2026, D2999, D2015, D2031, D2032, DECLINED-005, DECLINED-182, DECLINED-XXX, RESTRICTED CARD, "Declined", "Do not honor"
- processor_error: D0050, D0092, D1006, D2010, D2021, D2030, D9503, D9506, D9507, "SystemError"
- other: duplicate codes (D0001, D0003, D0008, D2022) and everything else
Success codes: A0000 (A0002 partially approved).

## 9. Webhooks
Created in the dashboard (API, Webhooks, Add endpoint) or `POST /v1/webhooks` `{ event_types[], url, active }`. Bodies: `{ request_payload, api_response: { original: { data: {...} } }, event_type }` with event types "Charges Created", "Charge Captured", "Charge Voided", "Charge Failure", "Refund Created", "Token Created", "Dispute Created", subscription, plan and customer events. **No signature, secret, timestamp or source address is documented**, so a delivery cannot be authenticated (blocker B2). The adapter refuses every delivery (fail closed) and maps every body to `unknown`; payments are confirmed by reading the charge back. Event id for a future implementation: none is present in the bodies.

## 10. Idempotency
Header `Idempotency-Key` on `POST /v1/charges` ("the server returns the result of a previous request with the same key"); its character set and length are not stated, so a 40-character hexadecimal digest of the core's key is sent. Capture, void and refund have no documented idempotency header; the adapter reads the charge first, so a repeated capture or void is answered from the stored state; a repeated refund is not detectable (known limit).

## 11. Test data
Test cards (sandbox, TSYS cert box): Visa 4012 0000 9876 5439 (12/29, security code 999) and 4012 8818 8881 8888 (999); Mastercard 5146 3150 0000 0055 (998), 5146 3122 0000 0035, 5146 3126 2000 0053, 2223 0000 4840 0011; Amex 3714 4963 5392 376 (9997); Discover 6011 0009 9302 6909 (996). AVS data: address 8320, ZIP 85284. Test bank account 021000021 / 345234523452345 (ACH, out of scope). Outcomes beyond approval are not documented for specific amounts (open question 5). The minimum sandbox amount is $0.50.

## 12. Limits and capabilities
`supportsAuthCapture` true; `supportsThreeDS` false; `supportsRefund` true; `supportsPartialRefund` true (after batching); `supportsRecurring` false; `supportsPayout` false; not a merchant of record. Currency `USD` only. One mode, `hosted_fields`. A capture is for the full authorized amount; a void works only the same day; a refund works only after batching (a full refund before that is done as a void). Uncaptured charges expire after 7 days (platform hold 144 hours). Level 2/3 data, splits, tips, surcharge, wallets, ACH, customers and subscriptions are not used. Webhooks are not usable (B2) and the live Hosted Fields address is unknown (B3).

## 12a. Content security policy
Sandbox script and frames: `https://testportal.payarc.net`. The hosts used by the frames themselves (token requests to the API, fonts) are not documented; the API origin `https://testapi.payarc.net` is listed as well. Production hosts are unknown (B3).

## 13. Open questions
1. Production Hosted Fields script address (B3) and webhook authentication (B2).
2. Whether `iframeprocess.js` requires jQuery on the page (the demo loads it from `code.jquery.com`), and every host the frames use (CSP).
3. How a declined charge is returned (HTTP status and body, or a charge with `failure_code`), and whether `status` then holds the failure text.
4. The refund answer: whether `refund.data[]` carries the new refund and its status.
5. Test amounts or values that force declines in the sandbox.
6. The AVS meaning of `avs_status` (`0`, `N`, `M`) and `zip_check_passed`: the adapter treats `zip_check_passed` = 1 as a match and `avs_status` `N` with `zip_check_passed` 0 as a mismatch, all else as unknown.
