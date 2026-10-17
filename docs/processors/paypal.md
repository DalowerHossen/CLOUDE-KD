# PayPal (standalone) - documentation record

## 1. Sources read
Read in this session on 2026-10-17 (UTC) from PayPal's own sites:
- https://developer.paypal.com/api/rest/authentication , /api/rest/webhooks/rest , /api/rest/webhooks/event-names
- https://developer.paypal.com/expanded/card-fields (Card Fields, JavaScript SDK v6), /expanded/3d-secure , /v5/expanded/3d-secure/response-parameters , /v5/expanded/3d-secure/test-scenarios
- https://developer.paypal.com/checkout/delay-capture , /whats-an-order , /expanded/handle-buyer-errors , /v5/expanded/card-decline-errors
- https://developer.paypal.com/sandbox-testing/card-testing , /negative-testing/request-headers
- https://developer.paypal.com/api/orders/v2/error-messages , /api/orders/v2/definitions/processor_response , /api/nvp-soap/AVSResponseCodes
- https://developer.paypal.com/sdk/js/best-practices (content security policy)
- PayPal's published OpenAPI specifications (https://github.com/paypal/paypal-rest-api-specifications, files `checkout_orders_v2.json` 2.32, `payments_payment_v2.json` 2.12, `notifications_webhooks_v1.json` 1.11) for exact field names.

## 2. Authentication and credential fields
OAuth 2.0 client credentials: `POST /v1/oauth2/token` with HTTP Basic (client id : client secret) and body `grant_type=client_credentials`; the response has `access_token` and `expires_in` (seconds); calls use `Authorization: Bearer <token>`. For the browser a separate "browser-safe" token is requested with `grant_type=client_credentials&response_type=client_token&intent=sdk_init` (the SDK `clientToken`). Fields (names only): `clientId` (not secret), `clientSecret` (secret), `webhookId` (not secret; the id shown when the listener URL is subscribed, needed to verify every webhook). PayPal's pages do not give a key prefix that tells sandbox from live, so the environment setting alone selects the host; credentials of the other environment are refused by PayPal with 401.

## 3. Environments
Sandbox `https://api-m.sandbox.paypal.com`, live `https://api-m.paypal.com`. SDK script v6: sandbox `https://www.sandbox.paypal.com/web-sdk/v6/core`, live `https://www.paypal.com/web-sdk/v6/core`. A sandbox business account and REST app come from the PayPal developer dashboard (https://developer.paypal.com/dashboard).

## 4. Secure form
Card Fields of the JavaScript SDK v6 (hosted fields): `window.paypal.createInstance({ clientToken, components: ['card-fields'] })`, `sdk.findEligibleMethods()` (`isEligible('advanced_cards')`), `sdk.createCardFieldsOneTimePaymentSession()`, `session.createCardFieldsComponent({ type: 'number' | 'expiry' | 'cvv' })`, then `session.submit(orderId, { billingAddress: { postalCode } })` returns `{ state, data }` with `state` `succeeded`, `canceled` or `failed`; for `succeeded`, `data` has `orderId` and `liabilityShift`. 3D Secure runs inside `submit`. Unlike a token-based processor, **the order is created first (on the server) and the payer's card is attached to that order in the browser**. So the "payment token" we receive is the approved PayPal **order id**, and the amount is fixed by the server when the order is created. The server verifies the order (amount, currency, custom id, status) before it authorizes (section 5).

## 5. Operations (Orders v2 and Payments v2)
All requests are JSON. `PayPal-Request-Id` (idempotency, stored 6 hours, up to 72 on request) is sent on every POST; `Prefer: return=representation` returns the full object.
- Create order (at checkout-session time): `POST /v2/checkout/orders` with `intent: "AUTHORIZE"`, `purchase_units[0]` = `{ reference_id, custom_id (invoice id), amount: { currency_code: "USD", value } }` and `payment_source.card = { attributes: { verification: { method } }, experience_context: { return_url, cancel_url } }`. Order states: `CREATED`, `SAVED`, `APPROVED`, `VOIDED`, `COMPLETED`, `PAYER_ACTION_REQUIRED`. An order stays `CREATED` for 3 hours.
- Verify (at authorize time): `GET /v2/checkout/orders/{id}`.
- Authorize: `POST /v2/checkout/orders/{id}/authorize`; the result is in `purchase_units[0].payments.authorizations[0]` (`id`, `status`: `CREATED`, `CAPTURED`, `DENIED`, `PARTIALLY_CAPTURED`, `VOIDED`, `PENDING`; `processor_response`; `expiration_time`). Only one authorization per order is allowed (`ORDER_ALREADY_AUTHORIZED`). An authorization holds funds for up to 29 days; the highest success rate is in the first 3 days (honor period).
- Capture: `POST /v2/payments/authorizations/{authorization_id}/capture` with `{ amount, final_capture }`; status `COMPLETED`, `DECLINED`, `PENDING`, `PARTIALLY_REFUNDED`, `REFUNDED`, `FAILED`.
- Void: `POST /v2/payments/authorizations/{authorization_id}/void`.
- Refund: `POST /v2/payments/captures/{capture_id}/refund` with `{ amount, note_to_payer }` (empty body = full refund); status `COMPLETED`, `PENDING`, `FAILED`, `CANCELLED`.
- Our `processorTransactionId` is the **order id** (stable across authorize, capture, refund); the authorization id and capture id are read from the order each time.
- Connection test: obtain an access token, then `GET /v1/notifications/webhooks/{webhook_id}` to prove the webhook id belongs to the app.

## 6. 3D Secure
Requested with `payment_source.card.attributes.verification.method`: `SCA_ALWAYS` (attempt 3DS for eligible cards and regions), `SCA_WHEN_REQUIRED` (only when mandated), also `3D_SECURE` and `AVS_CVV`. Result in `payment_source.card.authentication_result`: `liability_shift` (`POSSIBLE`, `NO`, `UNKNOWN`) and `three_d_secure.enrollment_status` (`Y`, `N`, `U`, `B`) and `authentication_status` (`Y` successful, `N` failed, `R` rejected, `A` attempted, `U` unable, `C` challenge required, `I` information only, `D` decoupled). PayPal's table: continue with authorization when enrollment `Y` with status `Y` or `A` (liability `POSSIBLE`), or when enrollment is `N`, `U` or `B` with liability `NO`; do not continue when enrollment is `Y` with status `N`, `R`, `U`, `C` or empty, or when liability is `UNKNOWN`. The adapter follows that table and does not authorize in the "do not continue" cases (the payment fails with `three_ds_failed`). "Passed" for our rules means enrollment `Y` and status `Y`; `liabilityShift` is `true` for `POSSIBLE`, `false` for `NO`, `null` for `UNKNOWN`. Policy mapping: `preferred` and `required` -> `SCA_ALWAYS`, `disabled` -> `SCA_WHEN_REQUIRED`.

## 7. Card identity (REQ-CARD)
PayPal documents no card fingerprint and no token for a card that is not vaulted (vaulting means storing the card, which we do not do). The order's `payment_source.card` returns `last_digits`, `brand`, `from_request.expiry` and `bin_details.bin`. The adapter builds the identity `bin|last_digits|expiry|brand` (type `fingerprint`), which the core stores only as an HMAC. Limit: two different cards with the same BIN, last four digits, expiry and brand would share an identity; this is rare and errs toward counting more, not less. Recorded as a known limit.

## 8. Decline mapping
Source: `processor_response.response_code` of the authorization (full table of 154 values read from the Orders v2 definition) and, for HTTP 422, the `details[].issue`. Mapping used:
- insufficient_funds: `5120`
- invalid_number: `1330`, `5180`, `0390`, `6300`
- invalid_expiry: `5400`, `1380`, `PPEX`, `PPEF`
- invalid_cvv: `00N7`, `5110`, `1382`, `PCVV`, `PPC2`
- three_ds_failed: `5650` (DECLINED_SCA_REQUIRED), `7700`, `7710`, `PPD3`; issue `ORDER_NOT_APPROVED`
- processor_fraud_signal: `9500` (SUSPECTED_FRAUD), `9520` (LOST_OR_STOLEN), `5150` (PICKUP_CARD)
- do_not_honor: `0500`, `9540`, `5100`, `5140`, `5160`, `0580`, `5700`, `10BR`, `PP06`, `PPAB`, `5930`; issues `INSTRUMENT_DECLINED`, `TRANSACTION_REFUSED`
- processor_error: `0960`, `8000`, `8010`, `8020`, `8100`, `8110`, `8220`, `5910`, `5920`, `9100`, `0800`, `PPER`, `PPNT`, `9600`
- everything else (including `5170` AVS_FAILURE, `5200` DUPLICATE_TRANSACTION, `CARD_BRAND_NOT_SUPPORTED`, `CARD_TYPE_NOT_SUPPORTED`, `PAYER_CANNOT_PAY`): other.
The AVS code of the same object is read for the postal check: matched (`M`, `D`, `F`, `P`, `W`, `X`, `Y`, `Z`), not matched (`A`, `B`, `C`, `N`, `E`), anything else unknown.

## 9. Webhooks
Headers (lower-cased by the core): `paypal-transmission-id`, `paypal-transmission-time`, `paypal-transmission-sig`, `paypal-cert-url`, `paypal-auth-algo`. PayPal documents two methods: self verification (RSA-SHA256 over `transmissionId|timeStamp|webhookId|crc32(rawBody)` with the public key of the certificate at `paypal-cert-url`) and the postback `POST /v1/notifications/verify-webhook-signature` (fields `transmission_id`, `transmission_time`, `cert_url`, `auth_algo`, `transmission_sig`, `webhook_id`, `webhook_event`; response `verification_status` `SUCCESS` or `FAILURE`). The adapter uses the **postback**, because self verification needs the certificate to be downloaded from a URL taken from the request (a request-controlled address) and PayPal's sample does not validate the certificate chain. The `webhook_event` must be posted exactly as received, so the request body is built by inserting the raw text. The platform also refuses a delivery whose `paypal-transmission-time` differs from now by more than 5 minutes (PayPal states no window; the 5 minutes follow the platform rule for webhook replay). Postback verification does not work for simulator mock events (documented), so those are rejected.
Event JSON: `id` (`WH-...`, unique), `event_type`, `create_time`, `resource_type`, `resource` (with `supplementary_data.related_ids.order_id`, `authorization_id`, `capture_id`). The listener must answer 2xx. Events used: `PAYMENT.AUTHORIZATION.CREATED` -> payment.authorized; `PAYMENT.AUTHORIZATION.VOIDED` -> payment.voided; `PAYMENT.CAPTURE.COMPLETED` -> payment.captured; `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.DENIED` -> payment.failed; `PAYMENT.CAPTURE.REFUNDED` -> payment.refunded; `CUSTOMER.DISPUTE.CREATED`, `.UPDATED`, `.RESOLVED` -> dispute.opened, dispute.updated, dispute.closed. `processorTransactionId` = `related_ids.order_id`. Dispute resources name the disputed capture, not the order, so their `processorTransactionId` is `null` and the core takes no action on them (limit; STEP 13 reads disputes with the Disputes API). The documentation page read does not state PayPal's retry schedule beyond "the listener must respond 2xx every time".

## 10. Idempotency
Header `PayPal-Request-Id` on POSTs (stored 6 hours). The core's keys are sent as they are.

## 11. Test data
Sandbox cards (future expiry, 3-digit CVV): Visa 4012888888881881, 4005519200000004; Mastercard 2223000048400011; Amex 371449635398431. Card error triggers: type the trigger as the **name on the card** with Visa 4012888888881881: `CCREJECT-REFUSED` (0500 DO_NOT_HONOR), `CCREJECT-SF` (9500 SUSPECTED_FRAUD), `CCREJECT-EC` (5400 EXPIRED_CARD), `CCREJECT-IRC` (5180 INVALID_OR_RESTRICTED_CARD), `CCREJECT-IF` (5120 INSUFFICIENT_FUNDS), `CCREJECT-LS` (9520 LOST_OR_STOLEN), `CCREJECT-IA` (1330 INVALID_ACCOUNT), `CCREJECT-BANK_ERROR` (5100 GENERIC_DECLINE), `CCREJECT-CVV_F` (00N7). 3DS test cards (from the 3DS test scenarios page): successful frictionless Visa 4868719196829038; failed frictionless 4868719158130060; successful step-up 4868719166101368; failed step-up 4868719181895556; authentication unavailable on lookup 4868719488651967 (the page also lists a second set of cards for the other integration type: successful frictionless 4462603042343024, failed 4462603045503384). Negative testing of API calls is possible with request headers (see the negative-testing page).

## 12. Limits and capabilities
`supportsAuthCapture` true; `supportsThreeDS` true; `supportsRefund` true; `supportsPartialRefund` true; `supportsRecurring` false; `supportsPayout` false; `isMerchantOfRecord` false; one mode `default`; currencies `USD`. An order must be authorized within 3 hours of creation (the adapter creates it at page load; an expired order fails with a normal payment failure and the payer reloads). `AUTH_VALIDITY_HOURS_BY_PROCESSOR.paypal = 72` (the 3-day honor period; the authorization itself lasts 29 days). The business account must be a verified business account for authorization and capture (`AUTH_CAPTURE_NOT_ENABLED`).

## 12a. Content security policy (https://developer.paypal.com/sdk/js/best-practices)
PayPal's page lists `*.paypal.com`, `*.paypalobjects.com` (and `*.venmo.com`, not used) for `script-src`, `connect-src`, `frame-src`, `child-src`, `img-src` and `style-src`. Recorded in `PROCESSOR_ORIGINS.paypal` as `https://*.paypal.com` and `https://*.paypalobjects.com`. The platform's payment profile today sets `img-src` and `style-src` without these hosts; the Integrator must check that when the sandbox run is done (noted in the handoff).

## 13. Open questions
None that block the adapter. Sandbox-only confirmations (listed in `paypal.verify.md`): the exact `status` of an order after `submit` for card payments with and without 3DS (`APPROVED` expected), the `authorization.status` for a rejection trigger (`DENIED` expected, or HTTP 422), and whether the merchant account must be separately approved for card payments (the eligibility page at /expanded/eligibility lists only the supported countries, currencies and card brands: 37 countries and 22 currencies; USD is listed for the United States).
