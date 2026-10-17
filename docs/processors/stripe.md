# Stripe - documentation record

## 1. Sources read
Read in this session on 2026-10-17 (UTC), from the provider's own site (Markdown versions of the pages):
- https://docs.stripe.com/api/payment_intents/create , /object , /list , /capture , /cancel
- https://docs.stripe.com/api/refunds/create
- https://docs.stripe.com/api/charges/object
- https://docs.stripe.com/api/idempotent_requests , /api/authentication , /api/errors , /api/versioning
- https://docs.stripe.com/payments/place-a-hold-on-a-payment-method
- https://docs.stripe.com/payments/accept-a-payment-deferred and /payments/build-a-two-step-confirmation (Payment Element, ConfirmationToken)
- https://docs.stripe.com/js/payment_intents/handle_next_action
- https://docs.stripe.com/payments/3d-secure , /payments/3d-secure/authentication-flow , /payments/finalize-payments-on-the-server
- https://docs.stripe.com/webhooks , /webhooks/signatures , /api/events/types
- https://docs.stripe.com/declines/codes , /testing

## 2. Authentication and credential fields
HTTP Basic Auth with the secret key as the user name and an empty password (`Authorization: Basic base64(key:)`); Bearer is also accepted. Test keys start with `sk_test_`; live mode uses restricted keys `rk_live_` (secret keys `sk_live_` also exist). Publishable keys (`pk_test_`, `pk_live_`) are used by Stripe.js. Webhook signing secrets start with `whsec_`.

Fields (names only): `secretKey` (secret, `^(sk|rk)_(test|live)_...`), `publishableKey` (not secret, `^pk_(test|live)_...`), `webhookSecret` (secret, `^whsec_...`). The adapter refuses a key whose mode (`test` or `live`) does not match the environment (sandbox or live) so the two are never mixed.

## 3. Environments
Base URL for both: `https://api.stripe.com`. Test mode (a "sandbox") is selected by the key (`sk_test_`/`pk_test_`); live by `live` keys. A sandbox is created in the Dashboard; the documentation also notes `stripe sandbox create` in the Stripe CLI for an anonymous sandbox with working keys. API version: the documentation names the current version `2026-09-30.endive`; the adapter sends the header `Stripe-Version` with that value (`STRIPE_API_VERSION` in the adapter) so behaviour does not depend on the account default.

## 4. Secure form
Payment Element of Stripe.js with a deferred intent (`stripe.elements({ mode: 'payment', amount, currency, captureMethod: 'manual' })`). On submit: `elements.submit()` then `stripe.createConfirmationToken({ elements })` returns a ConfirmationToken (`ctoken_...`). That id is the payment token we receive. The server creates and confirms the PaymentIntent with `confirmation_token`. Stripe.js must be loaded from `js.stripe.com` ("don't include the script in a bundle or host a copy yourself"); the page in the documentation uses `https://js.stripe.com/endive/stripe.js`. The ConfirmationToken is single use (it is consumed when the PaymentIntent is confirmed); a lifetime is not stated on the pages read.

## 5. Operations
Requests are `application/x-www-form-urlencoded` with bracket notation for nested fields.
- Authorize: `POST /v1/payment_intents` with `amount` (integer, smallest currency unit), `currency=usd`, `capture_method=manual`, `confirm=true`, `confirmation_token`, `return_url`, `payment_method_options[card][request_three_d_secure]`, `metadata[...]`, `description`. Status `requires_capture` = authorized (`amount_capturable`), `succeeded` = captured, `requires_action` = challenge pending (`next_action`), `requires_payment_method` = failed (the reason is in `last_payment_error`), `processing`, `canceled`.
- Capture: `POST /v1/payment_intents/{id}/capture` with optional `amount_to_capture`; returns status `succeeded`. Uncaptured PaymentIntents are cancelled after a set number of days (7 by default).
- Void: `POST /v1/payment_intents/{id}/cancel` (allowed in `requires_capture`, `requires_action`, ...); the authorized amount is released.
- Sale in one step: not used; `capture_method=manual` always (the core captures after verification).
- Refund: `POST /v1/refunds` with `payment_intent` (or `charge`), `amount` (integer), `reason` (`duplicate`, `fraudulent`, `requested_by_customer`). Partial refunds may be repeated until the charge is refunded. Response `status` (`succeeded`, `pending`, `failed`, `canceled`, `requires_action`).
- Status lookup: `GET /v1/payment_intents/{id}?expand[]=latest_charge` (expandable field `latest_charge`).
- Connection test: `GET /v1/payment_intents?limit=1` (a read that needs the same key).

## 6. 3D Secure
Requested with `payment_method_options[card][request_three_d_secure]`: `any` (request 3DS, prefer frictionless), `challenge` (prefer challenge), `automatic` (default, Radar decides). When 3DS is required the PaymentIntent becomes `requires_action` and `next_action` is `redirect_to_url` (`redirect_to_url.url`) or an SDK action; the browser calls `stripe.handleNextAction({ clientSecret })`, which may redirect to the `return_url`. After authentication the intent moves on (`processing` or `requires_capture`); a failed authentication returns it to `requires_payment_method`. The outcome is in the Charge: `payment_method_details.card.three_d_secure.result` (`authenticated` means success; `attempt_acknowledged` leads to a charge without liability shift) and `authentication_flow`. Liability shift is not guaranteed even after success; the adapter reports `liabilityShift` only as `null` (unknown). Policy mapping: `preferred` -> `any`, `required` -> `challenge`, `disabled` -> `automatic`. Authentication counts as passed only when `result` is `authenticated`.

## 7. Card identity (REQ-CARD)
Charge `payment_method_details.card.fingerprint` (the PaymentIntent is read with `latest_charge` expanded). Identity type `fingerprint`. It is returned for approvals and, when the failed charge exists, for declines (`last_payment_error.charge` gives the charge; the adapter reads it).

## 8. Decline mapping
Source: `last_payment_error` (`type`, `code`, `decline_code`) and the decline code table. Mapping used:
- `insufficient_funds` -> insufficient_funds
- `incorrect_number`, `invalid_number` -> invalid_number
- `expired_card`, `invalid_expiry_month`, `invalid_expiry_year` -> invalid_expiry
- `incorrect_cvc`, `invalid_cvc` -> invalid_cvv
- `authentication_required`, `authentication_not_handled` -> three_ds_failed
- `payment_intent_authentication_failure` (error code, 3DS failure) -> three_ds_failed
- `fraudulent`, `stolen_card`, `lost_card`, `pickup_card`, `merchant_blacklist` -> processor_fraud_signal
- `do_not_honor`, `generic_decline`, `call_issuer`, `restricted_card`, `not_permitted`, `transaction_not_allowed` -> do_not_honor
- `processing_error`, `issuer_not_available`, `try_again_later`, HTTP 5xx, 429, 424 -> processor_error
- everything else -> other
Open point 13.1 covers `payment_intent_authentication_failure` and `try_again_later`, which are Stripe error codes named on the error-codes page; the adapter treats them as listed and the verification step must confirm them in the sandbox.

## 9. Webhooks
Header `Stripe-Signature: t=<unix seconds>,v1=<hex>[,v1=...][,v0=...]`. Signed payload = `t` + `.` + raw body; expected = HMAC-SHA256 hex with the endpoint secret (`whsec_...`) as key; compare with every `v1` value in constant time; reject when the timestamp differs from now by more than the tolerance (documentation default for its libraries: 5 minutes; a tolerance of 0 disables the check and must not be used). The raw body must not be altered. Event JSON: `id` (`evt_...`, unique), `type`, `created`, `data.object`. Events used: `payment_intent.succeeded`, `payment_intent.amount_capturable_updated` (authorized), `payment_intent.payment_failed`, `payment_intent.requires_action`, `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`. Retries: up to three days with exponential back-off in live mode; endpoints should answer 2xx quickly. Duplicates can occur; the same object can produce two events, so the core uses the event `id`.

Normalized event type mapping: `payment_intent.amount_capturable_updated` -> payment.authorized; `payment_intent.succeeded` -> payment.captured; `payment_intent.payment_failed` -> payment.failed; `payment_intent.canceled` -> payment.voided; `charge.refunded` -> payment.refunded; `charge.dispute.created` -> dispute.opened; `charge.dispute.updated` -> dispute.updated; `charge.dispute.closed` -> dispute.closed (payload `outcome` = `won` when the dispute status is `won`, `lost` when `lost`); other types -> unknown. `processorTransactionId` = the PaymentIntent id (`pi_...`): `data.object.id` for `payment_intent.*`, `data.object.payment_intent` for `charge.*`, `data.object.payment_intent` for disputes.

## 10. Idempotency
Header `Idempotency-Key` on every POST (up to 255 characters; keys are kept at least 24 hours; reuse with different parameters is an error; the first result including 500 errors is replayed). The core's keys (`<paymentId>:authorize` etc.) are sent as they are.

## 11. Test data (from the Testing page)
Cards (any future expiry, any 3-digit CVC): success 4242424242424242; generic decline 4000000000000002 (`generic_decline`); insufficient funds 4000000000009995 (`insufficient_funds`); expired card 4000000000000069 (`expired_card`); incorrect CVC 4000000000000127 (`incorrect_cvc`); processing error 4000000000000119 (`processing_error`); incorrect number 4242424242424241 (`incorrect_number`); 3DS always authenticate 4000002760003184; 3DS authenticate unless set up 4000002500003155; fraud disputes 4000000000000259. Payment method ids for server tests: `pm_card_visa`, `pm_card_visa_chargeDeclined`, `pm_card_visa_chargeDeclinedInsufficientFunds`, `pm_card_authenticationRequired`. Test webhooks can be sent with the Stripe CLI or from the Dashboard.

## 12. Limits and capabilities
`supportsAuthCapture` true; `supportsThreeDS` true; `supportsRefund` true; `supportsPartialRefund` true; `supportsRecurring` false (not used); `supportsPayout` false; `isMerchantOfRecord` false; modes: one (`default`); currencies: `USD` (the platform sells in USD only). Authorization validity for card-not-present payments: 7 days (customer-initiated), merchant-initiated Visa 4 days 18 hours; the adapter sets `AUTH_VALIDITY_HOURS_BY_PROCESSOR.stripe = 114` (the shorter value).

## 13. Open questions
13.1 The exact error-code names `payment_intent_authentication_failure` and `try_again_later` were not shown on the pages read in this session (the error-codes page was not fetched). The adapter handles them as described; the code table is re-checked when the sandbox verification is run.
13.2 The lifetime of a ConfirmationToken is not stated on the pages read.
13.3 `stripe.handleNextAction` is documented for the "finalize payments on the server" flow, which we use; the exact `next_action.type` for card 3DS in the sandbox is confirmed in the sandbox run (the code handles `redirect_to_url` and treats every other type as an SDK action).
